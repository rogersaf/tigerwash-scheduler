import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, currentWeekStart, formatDate, addDays, DAY_NAMES } from '../api';
import { computeLiveFlags } from '../coverageUtils';

const KNOWN_MARKS = ['', 'X', 'AM', 'MID', 'PM'];
function isCustom(mark) { return mark && !KNOWN_MARKS.includes(mark); }
function safeDate(weekStart, dayOfWeek) {
  if (!weekStart || weekStart === 'recurring') return null;
  try { return addDays(weekStart, dayOfWeek); } catch { return null; }
}
function safeFmt(weekStart, dayOfWeek, fallbackWeekStart) {
  const d = safeDate(weekStart, dayOfWeek) || addDays(fallbackWeekStart, dayOfWeek);
  return formatDate(d);
}

const MARK_LABEL = { '': 'Available', X: 'Off all day', AM: 'No mornings (7–2)', MID: 'No mids (11–6)', PM: 'No evenings (2–close)' };
function markLabel(mark) { return isCustom(mark) ? `Custom: "${mark}"` : (MARK_LABEL[mark] || mark); }

export default function ManagerDashboard() {
  const navigate = useNavigate();
  const weekStart = currentWeekStart();
  const nextWeek  = addDays(weekStart, 7);
  const [employees, setEmployees]   = useState([]);
  const [scheduleData, setSchedule] = useState(null);
  const [pending, setPending]       = useState([]);
  const [currStatus, setCurrStatus] = useState([]);
  const [nextStatus, setNextStatus] = useState([]);
  const [loading, setLoading]       = useState(true);
  const [approvingId, setApprovingId] = useState(null);
  const [noteModal, setNoteModal]   = useState(null); // {row}
  const [noteText, setNoteText]     = useState('');
  const [msg, setMsg]               = useState('');

  async function load() {
    setLoading(true);
    try {
      const [emps, sched, pend, curr, next] = await Promise.all([
        api.employees(),
        api.schedule(weekStart),
        api.pendingAvailability(),
        api.availabilityStatus(weekStart),
        api.availabilityStatus(nextWeek),
      ]);
      setEmployees(emps);
      setSchedule(sched);
      setPending(pend);
      setCurrStatus(curr);
      setNextStatus(next);
    } catch {}
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function handleApprove(row) {
    setApprovingId(`${row.employee_id}-${row.week_start}-${row.day_of_week}`);
    try {
      const result = await api.approveAvailability(row.employee_id, row.week_start, row.day_of_week);
      setPending(prev => prev.filter(r =>
        !(r.employee_id === row.employee_id && r.week_start === row.week_start && r.day_of_week === row.day_of_week)
      ));
      if (result?.scheduleUpdated) {
        setMsg(`✓ Approved — ${row.employee_name}'s shift on ${safeFmt(row.week_start, row.day_of_week, weekStart)} was removed from the schedule.`);
      }
    } catch {}
    setApprovingId(null);
  }

  async function handleOverride(row, newMark) {
    try {
      await api.managerSetAvailabilityDay(row.employee_id, row.week_start, row.day_of_week, newMark);
      setPending(prev => prev.filter(r =>
        !(r.employee_id === row.employee_id && r.week_start === row.week_start && r.day_of_week === row.day_of_week)
      ));
    } catch (err) { alert(err.message); }
  }

  async function handleNoteApprove() {
    if (!noteModal) return;
    try {
      const result = await api.approveAvailability(noteModal.employee_id, noteModal.week_start, noteModal.day_of_week, noteText);
      setPending(prev => prev.filter(r =>
        !(r.employee_id === noteModal.employee_id && r.week_start === noteModal.week_start && r.day_of_week === noteModal.day_of_week)
      ));
      if (result?.scheduleUpdated) {
        setMsg(`✓ Approved — ${noteModal.employee_name}'s shift on ${safeFmt(noteModal.week_start, noteModal.day_of_week, weekStart)} was removed from the schedule.`);
      }
    } catch {}
    setNoteModal(null); setNoteText('');
  }

  function submitStatus(empId) {
    const curr = currStatus.find(s => s.employee_id === empId);
    const next = nextStatus.find(s => s.employee_id === empId);
    const currOk = curr?.submitted;
    const nextOk = next?.submitted;
    if (currOk && nextOk) return 'full';
    if (currOk || nextOk) return 'partial';
    return 'none';
  }

  const activeCount  = employees.filter(e => e.active).length;
  const managerCount = employees.filter(e => e.role === 'manager' && e.active).length;
  const lineCount    = employees.filter(e => e.role === 'line' && e.active).length;
  const shiftCount   = scheduleData?.shifts?.length ?? 0;
  const published    = !!scheduleData?.published;
  const dates        = DAY_NAMES.map((_, i) => addDays(weekStart, i));
  const liveFlags    = scheduleData ? computeLiveFlags(dates, scheduleData.shifts ?? [], employees, scheduleData.holidays ?? []) : [];
  const flagCount    = liveFlags.length;
  const weekLabel    = `${formatDate(weekStart)} – ${formatDate(addDays(weekStart, 6))}`;

  return (
    <>
      <div className="page-header">
        <div className="page-title">Dashboard</div>
        <div className="page-subtitle">{weekLabel}</div>
      </div>

      <div className="page-body">
        {msg && <div className="alert alert-success" style={{ marginBottom:16 }}>{msg}</div>}
        {loading ? <div className="text-muted text-sm">Loading…</div> : (
          <>
            {/* Stats */}
            <div className="stat-grid">
              <div className="stat-card">
                <div className="stat-label">Team Size</div>
                <div className="stat-value">{activeCount}</div>
                <div className="stat-sub">{managerCount} managers · {lineCount} crew</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">This Week</div>
                <div className="stat-value">{shiftCount}</div>
                <div className="stat-sub">shifts scheduled</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Coverage Flags</div>
                <div className="stat-value" style={{ color: flagCount > 0 ? 'var(--warning)' : 'var(--success)' }}>
                  {flagCount}
                </div>
                <div className="stat-sub">{flagCount > 0 ? 'need attention' : 'all good'}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Schedule</div>
                <div className="stat-value" style={{ fontSize: 18, color: published ? 'var(--success)' : 'var(--text-muted)' }}>
                  {published ? '● Live' : '○ Draft'}
                </div>
                <div className="stat-sub">{published ? 'employees can see it' : 'not posted yet'}</div>
              </div>
              <div className="stat-card" style={{ cursor: pending.length > 0 ? 'pointer' : 'default' }}>
                <div className="stat-label">Pending Review</div>
                <div className="stat-value" style={{ color: pending.length > 0 ? 'var(--danger)' : 'var(--success)' }}>
                  {pending.length}
                </div>
                <div className="stat-sub">{pending.length > 0 ? 'availability requests' : 'nothing pending'}</div>
              </div>
            </div>

            {/* Submission tracker */}
            {(() => {
              const crew = employees.filter(e => e.active && e.role === 'line');
              const fullCount = crew.filter(e => submitStatus(e.id) === 'full').length;
              return (
                <div className="card" style={{ marginBottom: 20 }}>
                  <div className="card-header">
                    <div className="card-title">✅ Availability Submitted — {fullCount}/{crew.length} ready</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      Green = both weeks done &nbsp;·&nbsp; Yellow = one week &nbsp;·&nbsp; Red = nothing submitted
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '12px 16px' }}>
                    {crew.map(emp => {
                      const st = submitStatus(emp.id);
                      const curr = currStatus.find(s => s.employee_id === emp.id);
                      const next = nextStatus.find(s => s.employee_id === emp.id);
                      const bg   = st === 'full' ? '#dcfce7' : st === 'partial' ? '#fef9c3' : '#fee2e2';
                      const txt  = st === 'full' ? '#166534' : st === 'partial' ? '#854d0e' : '#991b1b';
                      return (
                        <div key={emp.id} style={{ display:'flex', alignItems:'center', gap:6, padding:'6px 12px', borderRadius:20, background: bg, color: txt, fontSize:13, fontWeight:600 }}>
                          <span style={{ fontSize:9 }}>
                            {curr?.submitted ? '●' : '○'}{next?.submitted ? '●' : '○'}
                          </span>
                          {emp.name}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {/* Pending availability requests */}
            {pending.length > 0 && (
              <div className="card" style={{ marginBottom: 20 }}>
                <div className="card-header">
                  <div className="card-title">🔔 Pending Availability Requests ({pending.length})</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Review and approve or override each request</div>
                </div>
                <div className="card-body" style={{ padding: 0 }}>
                  {pending.map((row) => {
                    const key = `${row.employee_id}-${row.week_start}-${row.day_of_week}`;
                    const approving = approvingId === key;
                    const dayName = DAY_NAMES[row.day_of_week] || `Day ${row.day_of_week}`;
                    const weekOf = `${safeFmt(row.week_start, row.day_of_week, weekStart)}${row.week_start === 'recurring' ? ' (recurring)' : ''}`;
                    return (
                      <div key={key} className="pending-row">
                        <div className="pending-info">
                          <div className="pending-name">{row.employee_name}</div>
                          <div className="pending-detail">
                            <span className="pending-week">{dayName}, week of {weekOf}</span>
                            <span className={`pending-mark-chip ${isCustom(row.mark) ? 'chip-custom' : row.mark === 'X' ? 'chip-off' : 'chip-restrict'}`}>
                              {markLabel(row.mark)}
                            </span>
                          </div>
                          {row.manager_note && (
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                              Note: {row.manager_note}
                            </div>
                          )}
                        </div>
                        <div className="pending-actions">
                          <button
                            className="btn btn-success btn-sm"
                            disabled={approving}
                            onClick={() => handleApprove(row)}
                          >
                            {approving ? '…' : '✓ Approve'}
                          </button>
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => { setNoteModal(row); setNoteText(''); }}
                          >
                            📝 Note
                          </button>
                          <button
                            className="btn btn-danger btn-sm"
                            onClick={() => {
                              const mark = prompt(`Override ${row.employee_name}'s ${dayName} mark.\nEnter: available, X, AM, MID, or PM`);
                              if (mark !== null) handleOverride(row, mark.trim().toUpperCase() === 'AVAILABLE' ? '' : mark.trim().toUpperCase());
                            }}
                          >
                            Override
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Coverage flags */}
            {flagCount > 0 && (
              <div className="card" style={{ marginBottom: 20 }}>
                <div className="card-header">
                  <div className="card-title">⚠ Coverage Issues — {weekLabel}</div>
                </div>
                <div className="card-body">
                  {liveFlags.map((f, i) => (
                    <div key={i} className="flag-item">
                      <span className="flag-icon">⚠</span>
                      <span><strong>{formatDate(f.shift_date)}</strong> — {f.issue}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <button className="btn btn-primary" onClick={() => navigate('/schedule')}>📅 Schedule</button>
              <button className="btn btn-secondary" onClick={() => navigate('/employees')}>👥 Employees</button>
            </div>
          </>
        )}
      </div>

      {/* Note modal */}
      {noteModal && (
        <div className="modal-backdrop" onClick={() => setNoteModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">Add Note & Approve — {noteModal.employee_name}</div>
            <div style={{ marginBottom: 12, fontSize: 13, color: 'var(--text-muted)' }}>
              {DAY_NAMES[noteModal.day_of_week]}, {safeFmt(noteModal.week_start, noteModal.day_of_week, weekStart)}{noteModal.week_start === 'recurring' ? ' (recurring)' : ''}<br />
              Request: <strong>{markLabel(noteModal.mark)}</strong>
            </div>
            <div className="field">
              <label>Manager Note (optional)</label>
              <input
                type="text"
                placeholder="e.g. Confirmed — schedule adjusted"
                value={noteText}
                onChange={e => setNoteText(e.target.value)}
                autoFocus
              />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-success" onClick={handleNoteApprove}>✓ Approve</button>
              <button className="btn btn-secondary" onClick={() => setNoteModal(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
