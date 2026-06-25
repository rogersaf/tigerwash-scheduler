import { DAY_NAMES } from './api';

// Sunday close = 6pm, all other days = 8pm
function closeHour(date) {
  if (!date) return 20;
  const dow = new Date(date + 'T12:00:00').getDay();
  return dow === 0 ? 18 : 20;
}

export function parseShiftHours(shiftType, date) {
  if (!shiftType || shiftType === 'OFF') return 0;
  const STANDARD = { AM: 7, PM: 8, MID: 7, MANAGER: 8, TRAINING: 8 };
  if (STANDARD[shiftType] !== undefined) return STANDARD[shiftType];

  const low = shiftType.toLowerCase();
  const hasClose = low.includes('close');

  const normalized = [...shiftType].map(c => {
    const cp = c.codePointAt(0);
    if (cp === 32 || (cp >= 0x2010 && cp <= 0x2015) || cp === 0x2212) return '-';
    return c;
  }).join('').replace(/-+/g, '-');
  const m = normalized.match(/^(\d+)-(\d+|close)/i);
  if (m) {
    let startH = parseInt(m[1], 10);
    let endH = hasClose ? closeHour(date) : parseInt(m[2], 10);
    if (!hasClose && endH < startH) endH += 12;
    if (hasClose && startH < 7) startH += 12;
    const hrs = endH - startH;
    return hrs > 0 ? hrs : 0;
  }
  return 0;
}

export function shiftCategory(shiftType) {
  if (!shiftType || shiftType === 'OFF') return 'OFF';
  const low = shiftType.toLowerCase();
  if (low === 'manager' || low === 'training' || low.includes('mgr') || low.includes('manager')) return 'MANAGER';
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

// "9-close" starts AM and runs to close — covers both AM opener and PM closer
export function shiftCovers(shiftType, slot) {
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

export function computeLiveFlags(dates, shifts, employees, holidays) {
  const flags = [];
  for (const date of dates) {
    if (holidays?.some((h) => h.holiday_date === date)) continue;
    const ds = shifts.filter((s) => s.shift_date === date);
    const working = ds.filter((s) => shiftCategory(s.shift_type) !== 'OFF');
    if (working.length === 0) continue;

    const mgrWorking = working.filter((s) => employees.find((e) => e.id === s.employee_id)?.role === 'manager');
    const lineWorking = working.filter((s) => employees.find((e) => e.id === s.employee_id)?.role !== 'manager');

    if (mgrWorking.length === 0) flags.push({ shift_date: date, issue: 'No manager scheduled' });
    if (lineWorking.length === 0) flags.push({ shift_date: date, issue: 'No line crew scheduled' });

    const amAll = working.filter((s) => shiftCovers(s.shift_type, 'AM'));
    const amLine = lineWorking.filter((s) => shiftCovers(s.shift_type, 'AM'));
    if (amAll.length < 2) flags.push({ shift_date: date, issue: `Short on AM openers: ${amAll.length}/2` });

    const pmAll = working.filter((s) => shiftCovers(s.shift_type, 'PM'));
    const pmLine = lineWorking.filter((s) => shiftCovers(s.shift_type, 'PM'));
    if (pmAll.length < 2) flags.push({ shift_date: date, issue: `Short on PM closers: ${pmAll.length}/2` });

    const mgrPM = mgrWorking.filter((s) => shiftCovers(s.shift_type, 'PM'));
    if (pmLine.length === 0 && mgrPM.length > 0) {
      flags.push({ shift_date: date, issue: 'Manager solo PM — no line crew closing' });
    }
    const mgrIsAMOnly = mgrWorking.every((s) => !shiftCovers(s.shift_type, 'PM'));
    if (amLine.length > 0 && pmLine.length === 0 && mgrIsAMOnly) {
      flags.push({ shift_date: date, issue: 'Manager alone after openers leave — no PM crew' });
    }
  }
  return flags;
}
