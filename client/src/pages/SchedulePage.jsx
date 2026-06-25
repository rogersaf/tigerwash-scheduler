import React, { useState, useEffect } from 'react';
import ExcelJS from 'exceljs';
import { api, currentWeekStart, addDays, formatDate, DAY_NAMES, SHIFT_LABELS } from '../api';
import { shiftCategory, shiftCovers, computeLiveFlags, parseShiftHours } from '../coverageUtils';

const SHIFT_CLS = { AM: 'shift-am', PM: 'shift-pm', MANAGER: 'shift-manager', MID: 'shift-mid', TRAINING: 'shift-training', OFF: 'shift-off' };
function shiftCls(type) { return SHIFT_CLS[type] || SHIFT_CLS[shiftCategory(type)] || 'shift-custom'; }

// Hours rules
const LINE_MAX = 28;
const MGR_MIN = 35;

function weeklyHours(empId, shifts) {
  return shifts
    .filter((s) => s.employee_id === empId)
    .reduce((sum, s) => sum + parseShiftHours(s.shift_type, s.shift_date), 0);
}

function hoursColor(emp, hrs) {
  if (emp.role === 'manager') return hrs < MGR_MIN ? 'var(--warning)' : 'var(--success)';
  return hrs > LINE_MAX ? 'var(--danger)' : 'var(--success)';
}

function hoursTitle(emp, hrs) {
  if (emp.role === 'manager') return hrs < MGR_MIN ? `Below ${MGR_MIN}hr minimum` : 'Hours OK';
  return hrs > LINE_MAX ? `Over ${LINE_MAX}hr maximum` : 'Hours OK';
}

function fmtHour(h) {
  if (h === 12) return '12pm';
  return h > 12 ? `${h - 12}pm` : `${h}am`;
}
function formatShiftTime(type) {
  const STANDARD = { AM: '7am–2pm', PM: '2pm–close', MID: '11am–6pm', MANAGER: '8am–4pm', TRAINING: '8am–4pm', OFF: 'Off' };
  if (STANDARD[type] !== undefined) return STANDARD[type];
  const low = type.toLowerCase();
  const hasClose = low.includes('close');
  const normalized = [...type].map(c => { const cp = c.codePointAt(0); return (cp === 32 || (cp >= 0x2010 && cp <= 0x2015) || cp === 0x2212) ? '-' : c; }).join('').replace(/-+/g, '-');
  const m = normalized.match(/^(\d+)-(\d+|close)/i);
  if (!m) return type;
  let startH = parseInt(m[1], 10);
  let endH = hasClose ? 18 : parseInt(m[2], 10);
  if (!hasClose && endH < startH) endH += 12;
  if (hasClose && startH < 7) startH += 12;
  return hasClose ? `${fmtHour(startH)}-close` : `${fmtHour(startH)}-${fmtHour(endH)}`;
}
function shiftDisplay(shift) {
  return formatShiftTime(shift.shift_type);
}


function generateICS(shifts) {
  const lines = ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Tiger Wash Scheduler//EN','CALSCALE:GREGORIAN','METHOD:PUBLISH'];
  for (const s of shifts) {
    if (s.shift_type === 'OFF') continue;
    const d = s.shift_date.replace(/-/g, '');
    const nextD = addDays(s.shift_date, 1).replace(/-/g, '');
    const summary = `${s.employee_name} — ${s.custom_label || SHIFT_LABELS[s.shift_type]}`;
    lines.push('BEGIN:VEVENT', `DTSTART;VALUE=DATE:${d}`, `DTEND;VALUE=DATE:${nextD}`, `SUMMARY:${summary}`, `DESCRIPTION:${summary}`, 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

async function downloadXLSX(employees, shifts, dates, weekStart) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Schedule');

  const totalCols = 1 + dates.length;
  const weekEnd = dates[dates.length - 1];
  const toDate = d => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  ws.pageSetup = { paperSize: 1, orientation: 'landscape' };
  ws.pageMargins = { left: 0.3, right: 0.3, top: 0.3, bottom: 0.3, header: 0.1, footer: 0.1 };

  // Set column widths
  ws.getColumn(1).width = 20;
  for (let i = 2; i <= totalCols; i++) ws.getColumn(i).width = 15;

  const border = {
    top:    { style: 'thin', color: { argb: 'FF999999' } },
    left:   { style: 'thin', color: { argb: 'FF999999' } },
    bottom: { style: 'thin', color: { argb: 'FF999999' } },
    right:  { style: 'thin', color: { argb: 'FF999999' } },
  };

  // Row 1 — Title
  const titleRow = ws.getRow(1);
  titleRow.height = 38;
  titleRow.getCell(1).value = `Tiger Wash — Schedule: ${toDate(weekStart)} – ${toDate(weekEnd)}`;
  titleRow.getCell(1).font = { bold: true, size: 16, color: { argb: 'FF111827' } };
  titleRow.getCell(1).alignment = { vertical: 'middle', horizontal: 'left' };
  titleRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1FAE5' } };
  ws.mergeCells(1, 1, 1, totalCols);

  // Row 2 — Column headers
  const hdrRow = ws.getRow(2);
  hdrRow.height = 48;
  hdrRow.getCell(1).value = 'Employee';
  for (let i = 0; i < dates.length; i++) {
    hdrRow.getCell(i + 2).value = `${DAY_NAMES[i]}\n${new Date(dates[i] + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
  }
  for (let c = 1; c <= totalCols; c++) {
    const cell = hdrRow.getCell(c);
    cell.font = { bold: true, size: 14, color: { argb: 'FF1F2937' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } };
    cell.alignment = { vertical: 'middle', horizontal: c === 1 ? 'left' : 'center', wrapText: true };
    cell.border = border;
  }

  for (const emp of employees) {
    const row = ws.addRow([emp.name, ...dates.map(date => {
      const s = shifts.find(sh => sh.employee_id === emp.id && sh.shift_date === date);
      return s && s.shift_type !== 'OFF' ? shiftDisplay(s) : '';
    })]);
    row.height = 44;

    const nameCell = row.getCell(1);
    nameCell.font = { bold: true, size: 16, color: { argb: 'FF111827' } };
    nameCell.alignment = { vertical: 'middle', horizontal: 'left' };
    nameCell.border = border;

    for (let i = 0; i < dates.length; i++) {
      const s = shifts.find((sh) => sh.employee_id === emp.id && sh.shift_date === dates[i]);
      const working = s && s.shift_type !== 'OFF';
      const cell = row.getCell(i + 2);
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = border;
      if (working) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };
        cell.font = { size: 16, bold: true, color: { argb: 'FF111827' } };
      } else {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFF4444' } };
        cell.value = '';
      }
    }
  }

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `schedule-${weekStart}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
}

function downloadFile(content, filename, type) {
  const blob = new Blob([content], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
}

export default function SchedulePage() {
  const [weekStart, setWeekStart] = useState(currentWeekStart());
  const [employees, setEmployees] = useState([]);
  const [schedData, setSchedData] = useState({ shifts: [], flags: [], holidays: [] });
  const [availData, setAvailData] = useState([]); // all avail rows for current week
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [msg, setMsg] = useState('');
  const [overrideModal, setOverrideModal] = useState(null);
  const [overrideType, setOverrideType] = useState('AM');
  const [customLabel, setCustomLabel] = useState('');
  const [holidayModal, setHolidayModal] = useState(false);
  const [newHolidayDate, setNewHolidayDate] = useState('');
  const [newHolidayName, setNewHolidayName] = useState('');
  const [undoAction, setUndoAction] = useState(null);
  const [showHours, setShowHours] = useState(true);
  const [published, setPublished] = useState(false);
  const [publishing, setPublishing] = useState(false);

  useEffect(() => { loadData(); }, [weekStart]);

  async function loadData() {
    setLoading(true); setMsg('');
    try {
      const [emps, sched, avail] = await Promise.all([
        api.employees(),
        api.schedule(weekStart),
        api.availability(weekStart),
      ]);
      setEmployees(emps.filter((e) => e.active));
      setSchedData(sched);
      setAvailData(avail);
      setPublished(!!sched.published);
    } catch {}
    setLoading(false);
  }

  // Get an employee's availability mark for a specific date (0=Mon…6=Sun)
  function getAvailMark(empId, date) {
    const dayIdx = dates.findIndex(d => d === date);
    if (dayIdx === -1) return '';
    const row = availData.find(r => r.employee_id === empId && r.day_of_week === dayIdx);
    return row ? row.mark : '';
  }

  // Returns array of {emp, mark, canAM, canPM} for all active line employees on a date
  function dayAvailSnapshot(date) {
    return employees
      .filter(e => e.role === 'line')
      .map(emp => {
        const mark = getAvailMark(emp.id, date);
        return {
          emp,
          mark,
          off:   mark === 'X',
          canAM: mark !== 'X' && mark !== 'AM' && !emp.pm_only,
          canPM: mark !== 'X' && mark !== 'PM' && !emp.am_only,
        };
      })
      .sort((a, b) => (a.off ? 1 : 0) - (b.off ? 1 : 0) || a.emp.name.localeCompare(b.emp.name));
  }

  async function handleGenerate() {
    setGenerating(true); setMsg('');
    try {
      const before = { ...schedData };
      await api.generateSchedule(weekStart);
      setUndoAction({ type: 'generate', before });
      await loadData();
      setMsg('Schedule generated.');
    } catch (err) { setMsg('Error: ' + err.message); }
    finally { setGenerating(false); }
  }

  async function handlePublish() {
    setPublishing(true);
    try {
      if (published) {
        if (!confirm('Un-post this schedule? Employees will no longer see it.')) { setPublishing(false); return; }
        await api.unpublishSchedule(weekStart);
        setPublished(false);
        setMsg('Schedule un-posted.');
      } else {
        await api.publishSchedule(weekStart);
        setPublished(true);
        setMsg('✓ Schedule posted — employees can now view it.');
      }
    } catch (err) { setMsg('Error: ' + err.message); }
    finally { setPublishing(false); }
  }

  async function handleClearAll() {
    if (!confirm('Clear all shifts for this week? Use Undo to restore.')) return;
    try {
      const result = await api.clearSchedule(weekStart);
      setUndoAction({ type: 'clear', cleared: result.cleared || [] });
      await loadData();
      setMsg('Schedule cleared.');
    } catch (err) { setMsg('Error: ' + err.message); }
  }

  async function handleUndo() {
    if (!undoAction) return;
    try {
      if (undoAction.type === 'clear') {
        for (const s of undoAction.cleared) {
          await api.overrideShift(s.employee_id, s.shift_date, s.shift_type, s.custom_label);
        }
      } else if (undoAction.type === 'generate' && undoAction.before?.shifts) {
        for (const s of undoAction.before.shifts) {
          if (s.is_manual_override) {
            await api.overrideShift(s.employee_id, s.shift_date, s.shift_type, s.custom_label);
          }
        }
      } else if (undoAction.type === 'override') {
        if (undoAction.prev) {
          await api.overrideShift(undoAction.prev.employee_id, undoAction.prev.shift_date, undoAction.prev.shift_type, undoAction.prev.custom_label);
        } else {
          await api.deleteOverride(undoAction.employee_id, undoAction.shift_date);
        }
      } else if (undoAction.type === 'delete_override') {
        await api.overrideShift(undoAction.s.employee_id, undoAction.s.shift_date, undoAction.s.shift_type, undoAction.s.custom_label);
      }
      setUndoAction(null);
      await loadData();
      setMsg('Undone.');
    } catch (err) { setMsg('Undo failed: ' + err.message); }
  }

  function getShift(empId, date) {
    return schedData.shifts.find((s) => s.employee_id === empId && s.shift_date === date);
  }
  function isHoliday(date) { return schedData.holidays?.some((h) => h.holiday_date === date); }

  async function handleOverrideSave(finalShiftType) {
    if (!overrideModal) return;
    const prev = getShift(overrideModal.emp.id, overrideModal.date);
    const label = customLabel.trim() || null;
    const shiftType = finalShiftType || overrideType;
    try {
      const result = await api.overrideShift(overrideModal.emp.id, overrideModal.date, shiftType, label);
      const storedType = result?.storedType || label || shiftType;
      setUndoAction({ type: 'override', employee_id: overrideModal.emp.id, shift_date: overrideModal.date, prev: prev || null });
      // Update local state immediately with what was stored
      setSchedData(sd => ({
        ...sd,
        shifts: sd.shifts.some(s => s.employee_id === overrideModal.emp.id && s.shift_date === overrideModal.date)
          ? sd.shifts.map(s => s.employee_id === overrideModal.emp.id && s.shift_date === overrideModal.date
              ? { ...s, shift_type: storedType, is_manual_override: 1 } : s)
          : [...sd.shifts, { employee_id: overrideModal.emp.id, shift_date: overrideModal.date, shift_type: storedType, is_manual_override: 1, employee_name: overrideModal.emp.name, employee_role: overrideModal.emp.role }],
      }));
      setOverrideModal(null);
      await loadData();
    } catch (err) { alert('Save failed: ' + err.message); }
  }

  async function handleClearOverride(empId, date) {
    const s = getShift(empId, date);
    try {
      await api.deleteOverride(empId, date);
      setUndoAction({ type: 'delete_override', s });
      await loadData();
    } catch (err) { alert(err.message); }
  }

  async function handleAddHoliday() {
    if (!newHolidayDate) return;
    try {
      await api.addHoliday(newHolidayDate, newHolidayName || undefined);
      setHolidayModal(false); setNewHolidayDate(''); setNewHolidayName('');
      await loadData();
    } catch (err) { alert(err.message); }
  }

  async function handleRemoveHoliday(date) {
    if (!confirm(`Remove holiday on ${formatDate(date)}?`)) return;
    try { await api.deleteHoliday(date); await loadData(); } catch (err) { alert(err.message); }
  }

  function openOverrideModal(emp, date) {
    const ex = getShift(emp.id, date);
    setOverrideModal({ emp, date });
    const stdTypes = ['AM', 'PM', 'MID', 'MANAGER', 'OFF'];
    if (ex) {
      setOverrideType(ex.shift_type || 'AM');
      const label = stdTypes.includes(ex.shift_type) ? (SHIFT_LABELS[ex.shift_type] || '') : (ex.shift_type || '');
      setCustomLabel(label);
    } else {
      const defaultType = emp.role === 'manager' ? 'MANAGER' : 'AM';
      setOverrideType(defaultType);
      setCustomLabel(defaultType === 'MANAGER' ? '8am-4pm' : '');
    }
  }

  const weekEnd = addDays(weekStart, 6);
  const dates = DAY_NAMES.map((_, i) => addDays(weekStart, i));
  const today = new Date().toISOString().slice(0, 10);

  function coverageFor(date) {
    if (isHoliday(date)) return null;
    const ds = schedData.shifts.filter((s) => s.shift_date === date && s.shift_type !== 'OFF');
    const mgrShifts = ds.filter((s) => employees.find((e) => e.id === s.employee_id)?.role === 'manager');
    // All working staff count toward AM/PM; open-to-close shifts (e.g. "9-close") count for both
    return {
      am: ds.filter((s) => shiftCovers(s.shift_type, 'AM')).length,
      pm: ds.filter((s) => shiftCovers(s.shift_type, 'PM')).length,
      mgr: mgrShifts.length,
    };
  }


  // Hours summary for alert banner
  const hoursAlerts = employees.map((emp) => {
    const hrs = weeklyHours(emp.id, schedData.shifts);
    if (emp.role === 'manager' && hrs < MGR_MIN) return { name: emp.name, msg: `${hrs}/${MGR_MIN}h min` };
    if (emp.role !== 'manager' && hrs > LINE_MAX) return { name: emp.name, msg: `${hrs}/${LINE_MAX}h max` };
    return null;
  }).filter(Boolean);

  const gridCols = showHours ? '110px repeat(7, 1fr) 52px' : '110px repeat(7, 1fr)';

  return (
    <>
      <div className="page-header">
        <div className="page-header-row">
          <div>
            <div className="page-title">Schedule</div>
            <div className="page-subtitle">{formatDate(weekStart)} — {formatDate(weekEnd)}</div>
          </div>
          <div className="page-actions">
            {/* Publish status badge */}
            <span className={`publish-badge ${published ? 'publish-badge-live' : 'publish-badge-draft'}`}>
              {published ? '● Live' : '○ Draft'}
            </span>
            {undoAction && (
              <button className="btn btn-secondary btn-sm" onClick={handleUndo}>↩ Undo</button>
            )}
            <button className="btn btn-secondary btn-sm" onClick={() => setShowHours((v) => !v)}>
              {showHours ? '🕐 Hide Hrs' : '🕐 Show Hrs'}
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => downloadXLSX(employees, schedData.shifts, dates, weekStart)}>
              ⬇ Excel / Print
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => downloadFile(generateICS(schedData.shifts), `schedule-${weekStart}.ics`, 'text/calendar')}>
              📅 Export .ics
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => setHolidayModal(true)}>🏖 Closed Day</button>
            <button className="btn btn-danger btn-sm" onClick={handleClearAll}>🗑 Clear All</button>
            <button className="btn btn-primary" onClick={handleGenerate} disabled={generating}>
              {generating ? 'Generating…' : '⚡ Generate'}
            </button>
            <button
              className={`btn btn-lg ${published ? 'btn-secondary' : 'btn-success'}`}
              onClick={handlePublish}
              disabled={publishing}
              style={{ fontWeight: 700 }}
            >
              {publishing ? '…' : published ? 'Un-Post' : '📢 Post Schedule'}
            </button>
          </div>
        </div>
      </div>

      <div className="page-body">
        <div className="week-nav">
          <button className="btn btn-secondary btn-sm" onClick={() => setWeekStart(addDays(weekStart, -7))}>← Prev</button>
          <span className="week-label">{formatDate(weekStart)} – {formatDate(weekEnd)}</span>
          <button className="btn btn-secondary btn-sm" onClick={() => setWeekStart(addDays(weekStart, 7))}>Next →</button>
        </div>

        {msg && <div className="alert alert-info" style={{ marginBottom: 12 }}>{msg}</div>}

        {hoursAlerts.length > 0 && (
          <div className="alert alert-warning" style={{ marginBottom: 12 }}>
            <strong>⏱ Hours issues:</strong>{' '}
            {hoursAlerts.map((a) => `${a.name} (${a.msg})`).join(' · ')}
          </div>
        )}

        {!loading && (() => { const liveFlags = computeLiveFlags(dates, schedData.shifts, employees, schedData.holidays); return liveFlags.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            {liveFlags.map((f, i) => (
              <div key={i} className="flag-item">
                <span className="flag-icon">⚠</span>
                <span><strong>{formatDate(f.shift_date)}</strong> — {f.issue}</span>
              </div>
            ))}
          </div>
        ); })()}

        {loading ? <div className="text-muted text-sm">Loading…</div> : (
          <div className="schedule-grid-wrap">
            <div className="schedule-grid" style={{ '--grid-cols': gridCols }}>
              <div className="grid-header" style={{ gridTemplateColumns: gridCols }}>
                <div className="grid-header-cell" style={{ textAlign:'left', paddingLeft: 10 }}>Employee</div>
                {dates.map((date, d) => {
                  const hol = isHoliday(date);
                  return (
                    <div key={d} className={`grid-header-cell${date === today ? ' today' : ''}`}>
                      <div>{DAY_NAMES[d]}</div>
                      <span className="date-num">{new Date(date + 'T12:00:00').getDate()}</span>
                      {hol && (
                        <div style={{ fontSize: 9, color:'var(--warning)', fontWeight: 700 }}>
                          CLOSED
                          <button onClick={() => handleRemoveHoliday(date)} style={{ marginLeft:3, cursor:'pointer', background:'none', border:'none', color:'var(--danger)', fontSize:10 }}>✕</button>
                        </div>
                      )}
                    </div>
                  );
                })}
                {showHours && <div className="grid-header-cell" title="Weekly hours">Hrs</div>}
              </div>

              {employees.map((emp) => {
                const hrs = weeklyHours(emp.id, schedData.shifts);
                const hrsOk = emp.role === 'manager' ? hrs >= MGR_MIN : hrs <= LINE_MAX;
                return (
                  <div key={emp.id} className="grid-row" style={{ gridTemplateColumns: gridCols }}>
                    <div className="grid-name-cell">
                      <div className="grid-emp-name">{emp.name}</div>
                      <div className="grid-emp-role">{emp.role === 'manager' ? 'Manager' : emp.is_training ? 'Training' : 'Crew'}</div>
                    </div>
                    {dates.map((date, d) => {
                      const hol = isHoliday(date);
                      const shift = getShift(emp.id, date);
                      return (
                        <div key={d} className={`grid-cell${hol ? ' holiday' : ''}`}>
                          {hol ? (
                            <span style={{ fontSize:10, color:'var(--warning)' }}>—</span>
                          ) : shift ? (
                            <div style={{ width:'100%', textAlign:'center' }}>
                              {getAvailMark(emp.id, date) === 'X' && (
                                <div title="Employee marked off this day" style={{ fontSize:10, color:'var(--danger)', fontWeight:700, marginBottom:2 }}>
                                  ⚠ Off request
                                </div>
                              )}
                              <div className={`shift-chip ${shiftCls(shift.shift_type)}${shift.is_manual_override ? ' shift-manual' : ''}${getAvailMark(emp.id, date) === 'X' ? ' shift-conflict' : ''}`}>
                                <div style={{ lineHeight: 1.2 }}>{shiftDisplay(shift)}</div>
                                <div style={{ fontSize: 8, opacity: 0.65, marginTop: 1, letterSpacing: '0.04em' }}>
                                  {shiftCategory(shift.shift_type) === 'MANAGER' ? 'MGR' : shiftCategory(shift.shift_type)}
                                </div>
                              </div>
                              <div style={{ display:'flex', gap:2, justifyContent:'center' }}>
                                <button
                                  className="btn btn-ghost btn-sm"
                                  style={{ fontSize:10, marginTop:2, padding:'2px 4px' }}
                                  onClick={() => openOverrideModal(emp, date)}
                                >
                                  ✎ edit
                                </button>
                                {!!shift.is_manual_override && (
                                  <button
                                    className="btn btn-ghost btn-sm"
                                    style={{ fontSize:10, marginTop:2, padding:'2px 4px', color:'var(--danger)' }}
                                    onClick={() => { if (confirm('Remove manual override?')) handleClearOverride(emp.id, date); }}
                                  >
                                    ✕
                                  </button>
                                )}
                              </div>
                            </div>
                          ) : (
                            <button className="btn btn-ghost btn-sm" style={{ fontSize:11, color:'var(--text-light)' }} onClick={() => openOverrideModal(emp, date)}>
                              + add
                            </button>
                          )}
                        </div>
                      );
                    })}
                    {showHours && (
                      <div className="grid-cell" style={{ justifyContent:'center' }}>
                        <span
                          className="hrs-badge"
                          style={{ color: hrsOk ? 'var(--success)' : (emp.role === 'manager' ? 'var(--warning)' : 'var(--danger)') }}
                          title={hoursTitle(emp, hrs)}
                        >
                          {hrs}h
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}

              <div className="coverage-strip" style={{ gridTemplateColumns: gridCols }}>
                <div className="coverage-label">Coverage</div>
                {dates.map((date, d) => {
                  const cov = coverageFor(date);
                  if (!cov) return <div key={d} className="coverage-cell" />;
                  const amOk = cov.am >= 2, pmOk = cov.pm >= 2, mgrOk = cov.mgr >= 1;
                  return (
                    <div key={d} className="coverage-cell">
                      <div className={`cov-row ${amOk ? 'cov-ok' : 'cov-bad'}`}><div className="cov-dot" /> AM {cov.am}/2</div>
                      <div className={`cov-row ${pmOk ? 'cov-ok' : 'cov-bad'}`}><div className="cov-dot" /> PM {cov.pm}/2</div>
                      <div className={`cov-row ${mgrOk ? 'cov-ok' : 'cov-bad'}`}><div className="cov-dot" /> MGR {cov.mgr}</div>
                    </div>
                  );
                })}
                {showHours && <div className="coverage-cell" />}
              </div>
            </div>
          </div>
        )}

        {showHours && !loading && (
          <div className="hrs-legend">
            <span style={{ color:'var(--success)' }}>● OK</span>
            <span style={{ color:'var(--warning)' }}>● Manager under {MGR_MIN}h</span>
            <span style={{ color:'var(--danger)' }}>● Crew over {LINE_MAX}h</span>
          </div>
        )}
      </div>

      {/* Override Modal */}
      {overrideModal && (() => {
        function autoCategory(label) {
          if (!label) return 'AM';
          const low = label.toLowerCase();
          if (low === 'off') return 'OFF';
          if (low.includes('mgr') || low.includes('manager')) return 'MANAGER';
          if (low.includes('close') || low === 'pm') return 'PM';
          if (low === 'mid') return 'MID';
          const m = label.match(/^(\d+)/);
          if (m) {
            const h = parseInt(m[1], 10);
            if (h >= 13) return 'PM';   // 1pm+ → close
            if (h >= 11) return 'MID';  // 11am–12pm → mid
            // 1–6 without "close" = early AM (6am, 5am etc)
            return 'AM';
          }
          return 'AM';
        }
        const cat = autoCategory(customLabel);
        function resolveSaveType() {
          const low = customLabel.trim().toLowerCase();
          if (low === 'off' || low === '') return autoCategory(customLabel);
          return overrideModal.emp.role === 'manager' ? 'MANAGER' : autoCategory(customLabel);
        }
        const catLabel = { AM:'Open', PM:'Close', MID:'Mid', MANAGER:'Manager', OFF:'Off' }[overrideModal.emp.role === 'manager' && customLabel.trim().toLowerCase() !== 'off' && customLabel.trim() ? 'MANAGER' : cat];

        // Availability check for this employee on this date
        const empMark = getAvailMark(overrideModal.emp.id, overrideModal.date);
        const MARK_DESC = { X: 'marked off — day off', AM: 'no mornings (available PM only)', PM: 'no evenings (available AM only)', MID: 'unavailable for mid shifts' };
        const isUnavailable = empMark === 'X';
        const hasRestriction = empMark && empMark !== 'X';

        // Day availability snapshot for all line crew
        const snapshot = dayAvailSnapshot(overrideModal.date);
        const amAvail = snapshot.filter(s => s.canAM && !s.off);
        const pmAvail = snapshot.filter(s => s.canPM && !s.off);

        return (
          <div className="modal-backdrop" onClick={() => setOverrideModal(null)}>
            <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
              <div className="modal-title">
                Edit Shift — {overrideModal.emp.name}<br />
                <span style={{ fontSize:13, fontWeight:400, color:'var(--text-muted)' }}>{formatDate(overrideModal.date)}</span>
              </div>

              {/* Unavailability warning */}
              {isUnavailable && (
                <div className="alert alert-warning" style={{ marginBottom:12 }}>
                  ⚠ <strong>{overrideModal.emp.name}</strong> is <strong>not available</strong> this day (day off). You can still override below.
                </div>
              )}
              {hasRestriction && (
                <div className="alert alert-info" style={{ marginBottom:12 }}>
                  ℹ {overrideModal.emp.name} is {MARK_DESC[empMark] || empMark}.
                </div>
              )}

              {/* Day snapshot — who's available */}
              <details style={{ marginBottom:12, fontSize:12 }}>
                <summary style={{ cursor:'pointer', fontWeight:600, color:'var(--text-muted)', marginBottom:4 }}>
                  👥 Who's available {formatDate(overrideModal.date)}
                </summary>
                <div style={{ marginTop:8, display:'flex', gap:12, flexWrap:'wrap' }}>
                  <div>
                    <div style={{ fontWeight:700, marginBottom:4, color:'var(--primary)' }}>AM openers</div>
                    {amAvail.length === 0
                      ? <span style={{ color:'var(--danger)', fontSize:11 }}>None available</span>
                      : amAvail.map(s => (
                          <div key={s.emp.id} style={{ fontSize:11, padding:'2px 0' }}>
                            <span style={{ color:'var(--success)', marginRight:4 }}>●</span>{s.emp.name}
                            {s.mark === 'MID' ? <span style={{ color:'var(--text-light)', marginLeft:3 }}>(no mid)</span> : ''}
                          </div>
                        ))
                    }
                  </div>
                  <div>
                    <div style={{ fontWeight:700, marginBottom:4, color:'var(--primary)' }}>PM closers</div>
                    {pmAvail.length === 0
                      ? <span style={{ color:'var(--danger)', fontSize:11 }}>None available</span>
                      : pmAvail.map(s => (
                          <div key={s.emp.id} style={{ fontSize:11, padding:'2px 0' }}>
                            <span style={{ color:'var(--success)', marginRight:4 }}>●</span>{s.emp.name}
                            {s.mark === 'MID' ? <span style={{ color:'var(--text-light)', marginLeft:3 }}>(no mid)</span> : ''}
                          </div>
                        ))
                    }
                  </div>
                  {snapshot.filter(s => s.off).length > 0 && (
                    <div>
                      <div style={{ fontWeight:700, marginBottom:4, color:'var(--danger)' }}>Off</div>
                      {snapshot.filter(s => s.off).map(s => (
                        <div key={s.emp.id} style={{ fontSize:11, padding:'2px 0', color:'var(--text-muted)' }}>
                          <span style={{ color:'var(--danger)', marginRight:4 }}>✕</span>{s.emp.name}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </details>

              <div className="field">
                <label>Shift Time</label>
                <input
                  type="text"
                  placeholder="7-2, 1-close, 11-6, off…"
                  value={customLabel}
                  autoFocus
                  onChange={(e) => setCustomLabel(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleOverrideSave(resolveSaveType()); }}
                  style={{ fontSize:16 }}
                />
                {customLabel.trim() && (
                  <div style={{ marginTop:5, fontSize:12, color:'var(--text-muted)' }}>
                    Counts as: <strong>{catLabel}</strong> shift for coverage
                  </div>
                )}
              </div>
              <div style={{ display:'flex', gap:8, marginTop:8 }}>
                <button className="btn btn-primary" onClick={() => handleOverrideSave(resolveSaveType())}>Save</button>
                <button className="btn btn-secondary" onClick={() => setOverrideModal(null)}>Cancel</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Holiday Modal */}
      {holidayModal && (
        <div className="modal-backdrop" onClick={() => setHolidayModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">Mark Closed Day</div>
            <div className="field">
              <label>Date</label>
              <input type="date" value={newHolidayDate} onChange={(e) => setNewHolidayDate(e.target.value)} />
            </div>
            <div className="field">
              <label>Label (optional)</label>
              <input type="text" placeholder="e.g. Independence Day" value={newHolidayName} onChange={(e) => setNewHolidayName(e.target.value)} />
            </div>
            <div style={{ display:'flex', gap:8, marginTop:8 }}>
              <button className="btn btn-primary" onClick={handleAddHoliday}>Mark Closed</button>
              <button className="btn btn-secondary" onClick={() => setHolidayModal(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
