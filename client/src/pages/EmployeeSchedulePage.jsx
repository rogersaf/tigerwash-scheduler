import React, { useState, useEffect } from 'react';
import { api, currentWeekStart, addDays, formatDate, DAY_NAMES } from '../api';
import { useAuth } from '../App';

const SHIFT_CLS = { AM: 'shift-am', PM: 'shift-pm', MANAGER: 'shift-manager', MID: 'shift-mid', OFF: 'shift-off' };
const SHIFT_LABELS = { AM: '7 – 2', PM: '2 – Close', MID: '11 – 6', MANAGER: '8 – 4', OFF: 'Off' };

function shiftLabel(s) {
  return s.custom_label || SHIFT_LABELS[s.shift_type] || s.shift_type;
}

function generateICS(shifts, forName) {
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0',
    'PRODID:-//Tiger Wash Scheduler//EN',
    'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
  ];
  for (const s of shifts) {
    if (s.shift_type === 'OFF') continue;
    const d = s.shift_date.replace(/-/g, '');
    const nextD = addDays(s.shift_date, 1).replace(/-/g, '');
    const summary = `Work — ${shiftLabel(s)}${s.employee_name ? ' (' + s.employee_name + ')' : ''}`;
    lines.push('BEGIN:VEVENT', `DTSTART;VALUE=DATE:${d}`, `DTEND;VALUE=DATE:${nextD}`,
      `SUMMARY:${summary}`, `DESCRIPTION:${summary}`, 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
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

export default function EmployeeSchedulePage() {
  const { user } = useAuth();
  const [weekStart, setWeekStart] = useState(currentWeekStart());
  const [schedData, setSchedData] = useState({ shifts: [], holidays: [], published: false });
  const [allNames, setAllNames] = useState([]); // [{id, name}] — loaded once
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);

  // Load names once (public endpoint, no manager auth needed)
  useEffect(() => {
    api.allNames().then(setAllNames).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    api.schedule(weekStart)
      .then(setSchedData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [weekStart]);

  const weekEnd = addDays(weekStart, 6);
  const dates = DAY_NAMES.map((_, i) => addDays(weekStart, i));
  const holidays = schedData.holidays || [];
  const published = !!schedData.published;

  function isHoliday(date) { return holidays.some((h) => h.holiday_date === date); }
  function getShift(empId, date) { return schedData.shifts.find((s) => s.employee_id === empId && s.shift_date === date); }

  const myShifts = schedData.shifts.filter((s) => s.employee_id === user.id);
  const today = new Date().toISOString().slice(0, 10);

  // Build ordered employee list for team view using allNames + Nick-first sort
  const teamList = [...allNames].sort((a, b) => {
    if (a.name === 'Nick') return -1;
    if (b.name === 'Nick') return 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <>
      <div className="page-header">
        <div className="page-header-row">
          <div>
            <div className="page-title">{showAll ? 'Team Schedule' : 'My Schedule'}</div>
            <div className="page-subtitle">{formatDate(weekStart)} — {formatDate(weekEnd)}</div>
          </div>
          <div className="page-actions">
            <button
              className={`btn btn-sm ${showAll ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setShowAll((v) => !v)}
            >
              {showAll ? '👤 Just Mine' : '👥 Full Team'}
            </button>
            {published && (
              <>
                <button className="btn btn-secondary btn-sm" onClick={() => downloadFile(generateICS(myShifts), `my-schedule-${weekStart}.ics`, 'text/calendar')}>
                  📅 My .ics
                </button>
                {showAll && (
                  <button className="btn btn-secondary btn-sm" onClick={() => downloadFile(generateICS(schedData.shifts), `schedule-${weekStart}.ics`, 'text/calendar')}>
                    📅 All .ics
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      <div className="page-body">
        <div className="week-nav">
          <button className="btn btn-secondary btn-sm" onClick={() => setWeekStart(addDays(weekStart, -7))}>← Prev</button>
          <span className="week-label">{formatDate(weekStart)} — {formatDate(weekEnd)}</span>
          <button className="btn btn-secondary btn-sm" onClick={() => setWeekStart(addDays(weekStart, 7))}>Next →</button>
        </div>

        {loading ? (
          <div className="text-muted text-sm">Loading…</div>
        ) : !published ? (
          <div className="not-posted-banner">
            <div className="not-posted-icon">📋</div>
            <div className="not-posted-title">Schedule Not Posted Yet</div>
            <div className="not-posted-sub">Your manager hasn't posted the schedule for this week. Check back soon.</div>
          </div>
        ) : showAll ? (
          /* ── Full team grid ── */
          <div className="schedule-grid-wrap">
            <div className="schedule-grid">
              <div className="grid-header">
                <div className="grid-header-cell" style={{ textAlign:'left', paddingLeft:10 }}>Employee</div>
                {dates.map((date, d) => (
                  <div key={d} className={`grid-header-cell${date === today ? ' today' : ''}`}>
                    <div>{DAY_NAMES[d]}</div>
                    <span className="date-num">{new Date(date + 'T12:00:00').getDate()}</span>
                    {isHoliday(date) && <div style={{ fontSize:9, color:'var(--warning)', fontWeight:700 }}>CLOSED</div>}
                  </div>
                ))}
              </div>

              {teamList.map((emp) => (
                <div key={emp.id} className={`grid-row${emp.id === user.id ? ' my-row' : ''}`}>
                  <div className="grid-name-cell">
                    <div className="grid-emp-name">{emp.name}{emp.id === user.id ? ' ★' : ''}</div>
                  </div>
                  {dates.map((date, d) => {
                    const hol = isHoliday(date);
                    const shift = getShift(emp.id, date);
                    return (
                      <div key={d} className={`grid-cell${hol ? ' holiday' : ''}`}>
                        {hol ? (
                          <span style={{ fontSize:10, color:'var(--warning)' }}>—</span>
                        ) : shift ? (
                          <div className={`shift-chip ${emp.id === user.id ? (SHIFT_CLS[shift.shift_type] || '') : 'shift-other'}`} style={{ fontSize:10 }}>
                            {shiftLabel(shift)}
                          </div>
                        ) : (
                          <span style={{ fontSize:11, color:'var(--text-light)' }}>—</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        ) : (
          /* ── My shifts card view ── */
          <>
            <div className="my-schedule-grid">
              {dates.map((date, d) => {
                const hol = isHoliday(date);
                const shift = getShift(user.id, date);
                const isToday = date === today;
                return (
                  <div key={d} className={`sched-day-card${isToday ? ' today-card' : ''}${hol ? ' holiday' : ''}`}>
                    <div className="sched-day-header">
                      <div className="sched-day-name">{DAY_NAMES[d]}</div>
                      <div className="sched-day-date">{new Date(date + 'T12:00:00').getDate()}</div>
                      {isToday && <div className="today-dot">Today</div>}
                    </div>
                    <div className="sched-day-body">
                      {hol ? (
                        <div className="sched-closed">Closed</div>
                      ) : shift ? (
                        <div className={`shift-chip ${SHIFT_CLS[shift.shift_type] || 'shift-am'}`}
                          style={{ width:'100%', textAlign:'center', padding:'8px 4px', fontSize:13 }}>
                          {shiftLabel(shift)}
                        </div>
                      ) : (
                        <div className="sched-off">Off</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {myShifts.length === 0 && (
              <div className="alert alert-info">No shifts scheduled for you this week.</div>
            )}

            <div style={{ marginTop:16, fontSize:12, color:'var(--text-muted)' }}>
              💡 Tap <strong>My .ics</strong> to add your schedule to Google Calendar or iPhone Calendar instantly.
            </div>
          </>
        )}
      </div>
    </>
  );
}
