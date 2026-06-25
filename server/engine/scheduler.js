function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function shiftCovers(shiftType, slot) {
  if (!shiftType || shiftType === 'OFF') return false;
  const low = shiftType.toLowerCase();
  const hasClose = low.includes('close');
  const m = shiftType.match(/^(\d+)/);
  const h = m ? parseInt(m[1], 10) : null;
  const startCat = h !== null ? (h >= 13 ? 'PM' : h >= 11 ? 'MID' : 'AM')
                 : (low === 'am' ? 'AM' : low === 'mid' ? 'MID' : 'PM');
  if (slot === 'AM') return startCat === 'AM';
  if (slot === 'PM') return hasClose || startCat === 'PM' || low === 'pm';
  return false;
}

function shiftCategory(shiftType) {
  if (!shiftType || shiftType === 'OFF') return 'OFF';
  const low = shiftType.toLowerCase();
  if (low === 'manager' || low.includes('mgr') || low.includes('manager')) return 'MANAGER';
  if (low === 'am') return 'AM';
  if (low === 'pm' || low.includes('close')) return 'PM';
  if (low === 'mid') return 'MID';
  const m = shiftType.match(/^(\d+)/);
  if (m) {
    const h = parseInt(m[1], 10);
    if (h >= 13) return 'PM';
    if (h >= 11) return 'MID';
    return 'AM';
  }
  return 'AM';
}

function generateSchedule(weekStart, db) {
  const employees = db.all('SELECT * FROM employees WHERE active = 1');
  const holidays = db.all('SELECT holiday_date FROM holidays').map((h) => h.holiday_date);

  const weekEnd = addDays(weekStart, 6);
  const manualOverrides = db.all(
    'SELECT * FROM schedule WHERE is_manual_override = 1 AND shift_date >= ? AND shift_date <= ?',
    [weekStart, weekEnd]
  );

  // Availability map: employee_id -> { dayIndex -> mark }
  const avRows = db.all('SELECT * FROM availability WHERE week_start = ?', [weekStart]);
  const avMap = {};
  for (const row of avRows) {
    if (!avMap[row.employee_id]) avMap[row.employee_id] = {};
    avMap[row.employee_id][row.day_of_week] = row.mark;
  }

  const schedule = manualOverrides.map((o) => ({ ...o, is_manual_override: 1 }));
  const flags = [];

  // Shifts-this-week counter (used for 2-day cap)
  const shiftsThisWeek = {};
  for (const emp of employees) shiftsThisWeek[emp.id] = 0;
  for (const o of manualOverrides) {
    if (o.shift_type !== 'OFF') shiftsThisWeek[o.employee_id] = (shiftsThisWeek[o.employee_id] || 0) + 1;
  }

  const isAssigned = (empId, date) =>
    schedule.some((s) => s.employee_id === empId && s.shift_date === date);

  const nick = employees.find((e) => e.name === 'Nick');
  const angel = employees.find((e) => e.name === 'Angel');
  const lineEmployees = employees.filter((e) => e.role === 'line');

  function canWork(emp, shiftType, dayIndex, date) {
    if (isAssigned(emp.id, date)) return false;
    const avail = avMap[emp.id]?.[dayIndex];
    if (avail === 'X') return false;
    if (shiftType === 'AM' && avail === 'AM') return false;
    if (shiftType === 'PM' && avail === 'PM') return false;
    if (emp.am_only && shiftType === 'PM') return false;
    if (emp.pm_only && shiftType === 'AM') return false;
    if (emp.days_allowed) {
      const allowed = JSON.parse(emp.days_allowed);
      if (!allowed.includes(dayIndex)) return false;
    }
    if (!emp.exempt_day_cap && emp.role === 'line' && shiftsThisWeek[emp.id] >= 2) return false;
    return true;
  }

  for (let d = 0; d < 7; d++) {
    const date = addDays(weekStart, d);
    if (holidays.includes(date)) continue;

    const isWeekday = d < 5;

    // --- Manager ---
    let managerOn = schedule.some(
      (s) => s.shift_date === date && s.shift_type === 'MANAGER' && employees.find((e) => e.id === s.employee_id)?.role === 'manager'
    );

    if (!managerOn && nick && isWeekday && !isAssigned(nick.id, date)) {
      const a = avMap[nick.id]?.[d];
      if (a !== 'X') {
        schedule.push({ employee_id: nick.id, shift_date: date, shift_type: 'MANAGER', is_manual_override: 0 });
        managerOn = true;
      }
    }

    if (!managerOn && angel && !isAssigned(angel.id, date)) {
      const a = avMap[angel.id]?.[d];
      if (a !== 'X') {
        schedule.push({ employee_id: angel.id, shift_date: date, shift_type: 'MANAGER', is_manual_override: 0 });
        managerOn = true;
      }
    }

    if (!managerOn) flags.push({ shift_date: date, week_start: weekStart, issue: 'No manager available' });

    // Count manual override coverage for this day (so "7-1" etc. credit toward AM/PM)
    const todayManualLine = schedule.filter(
      (s) => s.shift_date === date && s.is_manual_override &&
             lineEmployees.some((e) => e.id === s.employee_id)
    );
    let amFilled = todayManualLine.filter((s) => shiftCovers(s.shift_type, 'AM')).length;
    let pmFilled = todayManualLine.filter((s) => shiftCovers(s.shift_type, 'PM')).length;

    // --- AM openers ---
    const amCandidates = lineEmployees
      .filter((e) => canWork(e, 'AM', d, date))
      .sort((a, b) => {
        if (d >= 5) {
          if (a.weekend_weighted && !b.weekend_weighted) return -1;
          if (!a.weekend_weighted && b.weekend_weighted) return 1;
        }
        return shiftsThisWeek[a.id] - shiftsThisWeek[b.id];
      });

    for (const emp of amCandidates) {
      if (amFilled >= 2) break;
      schedule.push({ employee_id: emp.id, shift_date: date, shift_type: 'AM', is_manual_override: 0 });
      shiftsThisWeek[emp.id]++;
      amFilled++;
    }
    if (amFilled < 2) flags.push({ shift_date: date, week_start: weekStart, issue: `Short on AM openers: ${amFilled}/2` });

    // --- PM closers ---
    const pmCandidates = lineEmployees
      .filter((e) => canWork(e, 'PM', d, date))
      .sort((a, b) => {
        if (d >= 5) {
          if (a.weekend_weighted && !b.weekend_weighted) return -1;
          if (!a.weekend_weighted && b.weekend_weighted) return 1;
        }
        return shiftsThisWeek[a.id] - shiftsThisWeek[b.id];
      });

    for (const emp of pmCandidates) {
      if (pmFilled >= 2) break;
      schedule.push({ employee_id: emp.id, shift_date: date, shift_type: 'PM', is_manual_override: 0 });
      shiftsThisWeek[emp.id]++;
      pmFilled++;
    }
    if (pmFilled < 2) flags.push({ shift_date: date, week_start: weekStart, issue: `Short on PM closers: ${pmFilled}/2` });

    // --- Solo line employee warning ---
    const lineOnFloor = schedule.filter(
      (s) => s.shift_date === date &&
             lineEmployees.some((e) => e.id === s.employee_id) &&
             shiftCategory(s.shift_type) !== 'OFF'
    );
    if (lineOnFloor.length === 1) {
      const soloName = employees.find((e) => e.id === lineOnFloor[0].employee_id)?.name || 'Unknown';
      const available = lineEmployees.filter((e) => {
        if (lineOnFloor.some((s) => s.employee_id === e.id)) return false;
        const av = avMap[e.id]?.[d];
        return av !== 'X';
      }).map((e) => e.name);
      const suggestion = available.length ? ` — call in: ${available.join(', ')}` : ' — no other crew available';
      flags.push({ shift_date: date, week_start: weekStart, issue: `Solo line: only ${soloName} on floor${suggestion}` });
    } else if (lineOnFloor.length === 0) {
      flags.push({ shift_date: date, week_start: weekStart, issue: 'No line crew scheduled' });
    }
  }

  // --- Ensure Angel hits 35h minimum ---
  // Engine only assigns Angel as Nick's fallback; when Nick covers all weekdays she gets 0 hours.
  // After the main loop, top her up with MANAGER shifts on any remaining open days.
  if (angel) {
    const SHIFT_HRS = { AM: 7, PM: 8, MID: 7, MANAGER: 8, OFF: 0 };
    function angelHoursTotal() {
      return schedule
        .filter((s) => s.employee_id === angel.id && s.shift_type !== 'OFF')
        .reduce((sum, s) => sum + (SHIFT_HRS[s.shift_type] ?? 6), 0);
    }
    if (angelHoursTotal() < 35) {
      for (let d = 0; d < 7; d++) {
        if (angelHoursTotal() >= 35) break;
        const date = addDays(weekStart, d);
        if (holidays.includes(date)) continue;
        if (isAssigned(angel.id, date)) continue;
        const avail = avMap[angel.id]?.[d];
        if (avail === 'X') continue;
        schedule.push({ employee_id: angel.id, shift_date: date, shift_type: 'MANAGER', is_manual_override: 0 });
      }
    }
    if (angelHoursTotal() < 35) {
      flags.push({ shift_date: addDays(weekStart, 0), week_start: weekStart, issue: `Angel below 35h minimum: ${angelHoursTotal()}h scheduled` });
    }
  }

  return { schedule, flags };
}

function wouldBreakCoverage(employeeId, weekStart, newMarks, db) {
  const { flags: oldFlags } = generateSchedule(weekStart, db);
  const oldFailCount = oldFlags.length;

  // Save existing marks
  const existing = db.all('SELECT day_of_week, mark FROM availability WHERE employee_id = ? AND week_start = ?', [employeeId, weekStart]);

  // Apply new marks
  for (const { day_of_week, mark } of newMarks) {
    if (!mark) {
      db.run('DELETE FROM availability WHERE employee_id = ? AND week_start = ? AND day_of_week = ?', [employeeId, weekStart, day_of_week]);
    } else {
      db.run('INSERT OR REPLACE INTO availability (employee_id, week_start, day_of_week, mark) VALUES (?,?,?,?)', [employeeId, weekStart, day_of_week, mark]);
    }
  }

  const { flags: newFlags } = generateSchedule(weekStart, db);
  const newFailCount = newFlags.length;

  // Restore old marks
  for (const { day_of_week } of newMarks) {
    db.run('DELETE FROM availability WHERE employee_id = ? AND week_start = ? AND day_of_week = ?', [employeeId, weekStart, day_of_week]);
  }
  for (const row of existing) {
    db.run('INSERT OR REPLACE INTO availability (employee_id, week_start, day_of_week, mark) VALUES (?,?,?,?)', [employeeId, weekStart, row.day_of_week, row.mark]);
  }

  // If new schedule has MORE failures than before, check if employee is sole cause
  if (newFailCount <= oldFailCount) return false;

  // Run once more with employee completely removed from consideration
  db.run('UPDATE employees SET active = 0 WHERE id = ?', [employeeId]);
  const { flags: withoutEmpFlags } = generateSchedule(weekStart, db);
  db.run('UPDATE employees SET active = 1 WHERE id = ?', [employeeId]);

  // If removing the employee makes it WORSE or same → they're not the sole cause → allow
  // If removing them doesn't make it worse than new state → they ARE the sole cause → block
  return withoutEmpFlags.length < newFailCount;
}

module.exports = { generateSchedule, addDays, wouldBreakCoverage };
