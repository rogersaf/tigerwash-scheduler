import React, { useState, useEffect } from 'react';
import { api, currentWeekStart, addDays, DAY_NAMES, formatDate } from '../api';

const RULES_LABELS = {
  am_only:        'AM only',
  pm_only:        'PM only',
  exempt_day_cap: 'Exempt cap',
  weekend_weighted:'Wknd weighted',
  is_training:    'Training',
};

const KNOWN_MARKS = ['', 'X', 'AM', 'MID', 'PM'];
function isCustom(mark) { return mark && !KNOWN_MARKS.includes(mark); }
const MARK_OPTIONS = [
  { value: '',    label: 'Available',            cls: 'opt-free' },
  { value: 'X',   label: 'Off all day',           cls: 'opt-off'  },
  { value: 'AM',  label: 'No mornings (7–2)',     cls: 'opt-am'   },
  { value: 'MID', label: 'No mids (11–6)',        cls: 'opt-mid'  },
  { value: 'PM',  label: 'No evenings (2–close)', cls: 'opt-pm'   },
];
function markLabel(mark) {
  if (!mark) return 'Available';
  const opt = MARK_OPTIONS.find(o => o.value === mark);
  return opt ? opt.label : `Custom: "${mark}"`;
}

function nextWeekStart() { return addDays(currentWeekStart(), 7); }

export default function EmployeesPage() {
  const [employees, setEmployees]   = useState([]);
  const [availStatus, setAvailStatus] = useState({});
  const [loading, setLoading]       = useState(true);
  const [msg, setMsg]               = useState('');
  const [statusWeek, setStatusWeek] = useState(nextWeekStart());

  // Modals
  const [addModal, setAddModal]     = useState(false);
  const [editModal, setEditModal]   = useState(null);   // emp
  const [pinModal, setPinModal]     = useState(null);   // emp
  const [availModal, setAvailModal] = useState(null);   // emp

  // Add form
  const [newName, setNewName]       = useState('');
  const [newRole, setNewRole]       = useState('line');
  const [newPin, setNewPin]         = useState('');

  // Availability editor state (inside availModal)
  const [availWeek, setAvailWeek]   = useState(currentWeekStart());
  const [availRows, setAvailRows]   = useState([]);  // from server
  const [availEdits, setAvailEdits] = useState({}); // day_of_week -> mark (pending edits)
  const [availLoading, setAvailLoading] = useState(false);
  const [availSaving, setAvailSaving]   = useState(false);
  const [availMsg, setAvailMsg]         = useState('');

  async function load() {
    setLoading(true);
    try {
      const [emps, statuses] = await Promise.all([
        api.employees(),
        api.availabilityStatus(statusWeek).catch(() => []),
      ]);
      setEmployees(emps);
      const map = {};
      for (const s of statuses) map[s.employee_id] = s;
      setAvailStatus(map);
    } catch {}
    setLoading(false);
  }

  useEffect(() => { load(); }, [statusWeek]);

  // Load availability for the currently open employee modal
  useEffect(() => {
    if (!availModal) return;
    loadEmpAvail(true);
  }, [availModal, availWeek]);

  async function loadEmpAvail(clearMsg = false) {
    setAvailLoading(true);
    if (clearMsg) setAvailMsg('');
    try {
      const rows = await api.availability(availWeek, availModal.id);
      setAvailRows(rows);
      setAvailEdits({});
    } catch {}
    setAvailLoading(false);
  }

  function openAvailModal(emp) {
    setAvailModal(emp);
    setAvailWeek(currentWeekStart());
    setAvailRows([]);
    setAvailEdits({});
    setAvailMsg('');
  }

  function getAvailMark(d) {
    if (availEdits[d] !== undefined) return availEdits[d];
    const row = availRows.find(r => r.day_of_week === d);
    return row ? row.mark : '';
  }

  function getSavedMark(d) {
    const row = availRows.find(r => r.day_of_week === d);
    return row ? row.mark : '';
  }

  function isPending(d) {
    const row = availRows.find(r => r.day_of_week === d);
    return row?.needs_review === 1;
  }

  function isEdited(d) {
    return availEdits[d] !== undefined && availEdits[d] !== getSavedMark(d);
  }

  async function handleSaveAvail() {
    if (!availModal) return;
    const changes = [];
    for (let d = 0; d < 7; d++) {
      if (availEdits[d] !== undefined && availEdits[d] !== getSavedMark(d)) {
        changes.push({ day_of_week: d, mark: availEdits[d] || null });
      }
    }
    if (changes.length === 0) { setAvailMsg('No changes to save.'); return; }
    setAvailSaving(true);
    try {
      await api.managerSetAvailability(availModal.id, availWeek, changes);
      await loadEmpAvail();
      setAvailMsg(`✓ Saved for week of ${formatDate(availWeek)}.`);
    } catch (err) { setAvailMsg('Error: ' + err.message); }
    setAvailSaving(false);
  }

  async function handleApproveDay(d) {
    if (!availModal) return;
    const row = availRows.find(r => r.day_of_week === d);
    if (!row) return;
    try {
      await api.approveAvailability(availModal.id, row.week_start, d);
      setAvailMsg(`${DAY_NAMES[d]} approved.`);
      await loadEmpAvail();
    } catch (err) { setAvailMsg(err.message); }
  }

  // Employees management handlers
  async function handleAdd() {
    if (!newName.trim()) return;
    try {
      await api.addEmployee({ name: newName.trim(), role: newRole });
      setAddModal(false); setNewName(''); setNewRole('line');
      await load(); setMsg('Employee added.');
    } catch (err) { alert(err.message); }
  }

  async function handleToggleActive(emp) {
    if (!confirm(`${emp.active ? 'Deactivate' : 'Reactivate'} ${emp.name}?`)) return;
    try {
      await api.updateEmployee(emp.id, { active: emp.active ? 0 : 1 });
      await load();
    } catch (err) { alert(err.message); }
  }

  async function handleResetPin(emp) {
    if (!newPin || !/^\d{4}$/.test(newPin)) return alert('PIN must be 4 digits');
    try {
      await api.updateEmployee(emp.id, { pin: newPin });
      setPinModal(null); setNewPin(''); setMsg(`PIN updated for ${emp.name}.`);
    } catch (err) { alert(err.message); }
  }

  async function handleUpdateRule(emp, field, value) {
    try {
      await api.updateEmployee(emp.id, { [field]: value });
      await load();
    } catch (err) { alert(err.message); }
  }

  const active   = employees.filter(e => e.active);
  const inactive = employees.filter(e => !e.active);
  const submittedCount = active.filter(e => availStatus[e.id]?.submitted).length;
  const pendingCount   = active.filter(e => availStatus[e.id]?.has_pending).length;

  const dates = DAY_NAMES.map((_, i) => addDays(availWeek, i));

  return (
    <>
      <div className="page-header">
        <div className="page-header-row">
          <div>
            <div className="page-title">Employees</div>
            <div className="page-subtitle">
              {active.length} active · {submittedCount}/{active.length} availability submitted
              {pendingCount > 0 && <span style={{ color:'var(--danger)', marginLeft:8 }}>· {pendingCount} pending review</span>}
            </div>
          </div>
          <button className="btn btn-primary" onClick={() => setAddModal(true)}>+ Add Employee</button>
        </div>
      </div>

      <div className="page-body">
        {msg && <div className="alert alert-success">{msg}</div>}

        {/* Avail status week selector */}
        <div className="avail-status-bar">
          <div style={{ fontSize:13, fontWeight:600 }}>Availability for week of</div>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <button className="btn btn-secondary btn-sm" onClick={() => setStatusWeek(addDays(statusWeek,-7))}>←</button>
            <span style={{ fontSize:13, fontWeight:600, minWidth:100, textAlign:'center' }}>
              {new Date(statusWeek + 'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'})}
            </span>
            <button className="btn btn-secondary btn-sm" onClick={() => setStatusWeek(addDays(statusWeek,7))}>→</button>
          </div>
          <div className="avail-legend">
            <span className="avail-dot avail-dot-green" /> Submitted
            <span className="avail-dot avail-dot-red"   style={{ marginLeft:10 }} /> None
            <span className="avail-dot" style={{ background:'var(--danger)', marginLeft:10, border:'2px solid #fff', outline:'2px solid var(--danger)' }} /> Pending
          </div>
        </div>

        {loading ? <div className="text-muted text-sm">Loading…</div> : (
          <>
            <div className="card emp-table-wrap" style={{ marginBottom:20 }}>
              <table className="emp-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Role</th>
                    <th>PIN</th>
                    <th className="emp-hide-mobile">Rules</th>
                    <th>Avail</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {active.map(emp => {
                    const st = availStatus[emp.id];
                    let dotClass = 'avail-dot-red', dotTitle = 'Not submitted';
                    if (st?.submitted) { dotClass = 'avail-dot-green'; dotTitle = 'Availability on file'; }
                    const hasPending = st?.has_pending;

                    return (
                      <tr key={emp.id}>
                        <td><strong>{emp.name}</strong>{emp.is_training ? <span className="badge badge-training" style={{ marginLeft:5 }}>Training</span> : null}</td>
                        <td><span className={`badge ${emp.role==='manager'?'badge-manager':'badge-line'}`}>{emp.role==='manager'?'Manager':'Crew'}</span></td>
                        <td>
                          {emp.pin ? <span className="pin-display">{emp.pin}</span> : <span style={{ color:'var(--text-light)',fontSize:12 }}>Not set</span>}
                          <button className="btn btn-ghost btn-sm" style={{ marginLeft:4 }} onClick={()=>{setPinModal(emp);setNewPin('');}}>✎</button>
                        </td>
                        <td className="emp-hide-mobile">
                          <div style={{ display:'flex', flexWrap:'wrap', gap:3 }}>
                            {['am_only','pm_only','exempt_day_cap','weekend_weighted'].map(f =>
                              emp[f] ? <span key={f} style={{ fontSize:10,background:'var(--primary-light)',color:'var(--primary)',border:'1px solid #bfdbfe',borderRadius:4,padding:'1px 5px',fontWeight:600 }}>{RULES_LABELS[f]}</span> : null
                            )}
                          </div>
                        </td>
                        <td>
                          <span style={{ display:'flex', alignItems:'center', gap:4 }}>
                            <span className={`avail-dot avail-dot-lg ${dotClass}`} title={dotTitle} />
                            {hasPending && <span className="pending-badge-sm" title="Has pending requests">!</span>}
                          </span>
                        </td>
                        <td style={{ whiteSpace:'nowrap' }}>
                          <button className="btn btn-secondary btn-sm" onClick={() => openAvailModal(emp)}>
                            📋 Availability
                          </button>
                          <button className="btn btn-secondary btn-sm" style={{ marginLeft:4 }} onClick={() => setEditModal(emp)}>Rules</button>
                          <button className="btn btn-danger btn-sm" style={{ marginLeft:4 }} onClick={() => handleToggleActive(emp)}>Off</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {inactive.length > 0 && (
              <div className="card emp-table-wrap">
                <div className="card-header"><div className="card-title">Inactive</div></div>
                <table className="emp-table">
                  <tbody>
                    {inactive.map(emp => (
                      <tr key={emp.id} style={{ opacity:.5 }}>
                        <td>{emp.name}</td><td>{emp.role}</td>
                        <td colSpan={4}><button className="btn btn-secondary btn-sm" onClick={() => handleToggleActive(emp)}>Reactivate</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Availability Profile Modal ── */}
      {availModal && (
        <div className="modal-backdrop" onClick={() => setAvailModal(null)}>
          <div className="modal modal-wide" onClick={e => e.stopPropagation()}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
              <div className="modal-title" style={{ margin:0 }}>
                📋 Availability — {availModal.name}
                <div style={{ fontSize:12, fontWeight:400, color:'var(--text-muted)', marginTop:2 }}>
                  {availModal.role === 'manager' ? 'Manager (min 35h/wk)' : 'Crew (max 28h/wk)'}
                </div>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => setAvailModal(null)}>✕</button>
            </div>

            {/* Week nav */}
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:16 }}>
              <button className="btn btn-secondary btn-sm" onClick={() => setAvailWeek(addDays(availWeek,-7))}>← Prev</button>
              <span style={{ flex:1, textAlign:'center', fontSize:13, fontWeight:600 }}>
                Week of {formatDate(availWeek)}
              </span>
              <button className="btn btn-secondary btn-sm" onClick={() => setAvailWeek(addDays(availWeek,7))}>Next →</button>
            </div>

            {availMsg && (
              <div className={`alert ${availMsg.startsWith('Error') ? 'alert-error' : 'alert-success'}`} style={{ marginBottom:12 }}>
                {availMsg}
              </div>
            )}

            {availLoading ? (
              <div className="text-muted text-sm">Loading…</div>
            ) : (
              <div className="avail-profile-grid">
                {DAY_NAMES.map((dayName, d) => {
                  const date = dates[d];
                  const currentMark = getAvailMark(d);
                  const pending = isPending(d) && !isEdited(d);
                  const saved = getSavedMark(d);
                  const edited = isEdited(d);

                  return (
                    <div key={d} className={`avail-profile-day${pending ? ' avail-profile-pending' : ''}${edited ? ' avail-profile-edited' : ''}`}>
                      <div className="avail-profile-day-header">
                        <strong>{dayName}</strong>
                        <span style={{ fontSize:11, color:'var(--text-muted)' }}>{new Date(date+'T12:00:00').getDate()}</span>
                        {pending && <span className="pending-badge-sm" title="Needs review">!</span>}
                      </div>

                      {/* Current mark display */}
                      <div style={{ fontSize:12, marginBottom:6, color: pending ? 'var(--danger)' : 'var(--text-muted)' }}>
                        {isCustom(currentMark)
                          ? <span style={{ fontStyle:'italic' }}>"{currentMark}"</span>
                          : markLabel(currentMark)
                        }
                        {saved && isCustom(saved) && !edited && (
                          <div style={{ fontSize:10, color:'var(--text-light)', marginTop:1 }}>Employee note</div>
                        )}
                      </div>

                      {/* Manager override select */}
                      <select
                        value={KNOWN_MARKS.includes(currentMark) ? currentMark : 'custom'}
                        onChange={e => setAvailEdits(prev => ({ ...prev, [d]: e.target.value }))}
                        style={{ width:'100%', fontSize:11, padding:'4px 6px', borderRadius:6, border:'1px solid var(--border-strong)', marginBottom:4 }}
                      >
                        {MARK_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        {isCustom(currentMark) && !edited && (
                          <option value="custom" disabled>Custom (employee note)</option>
                        )}
                      </select>

                      {/* Approve button if pending */}
                      {pending && (
                        <button
                          className="btn btn-success btn-sm"
                          style={{ width:'100%', marginTop:3 }}
                          onClick={() => handleApproveDay(d)}
                        >
                          ✓ Approve
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <div style={{ display:'flex', gap:8, marginTop:16 }}>
              <button className="btn btn-primary" onClick={handleSaveAvail} disabled={availSaving}>
                {availSaving ? 'Saving…' : '💾 Save Changes'}
              </button>
              <button className="btn btn-secondary" onClick={() => setAvailModal(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Employee Modal */}
      {addModal && (
        <div className="modal-backdrop" onClick={() => setAddModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">Add Employee</div>
            <div className="field">
              <label>Full Name</label>
              <input type="text" value={newName} onChange={e => setNewName(e.target.value)} placeholder="First Last" autoFocus />
            </div>
            <div className="field">
              <label>Role</label>
              <select value={newRole} onChange={e => setNewRole(e.target.value)}>
                <option value="line">Crew (max 28h/wk)</option>
                <option value="manager">Manager (min 35h/wk)</option>
              </select>
            </div>
            <p className="text-sm text-muted" style={{ marginBottom:16 }}>They'll set their own PIN on first login.</p>
            <div style={{ display:'flex', gap:8 }}>
              <button className="btn btn-primary" onClick={handleAdd}>Add</button>
              <button className="btn btn-secondary" onClick={() => setAddModal(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* PIN Modal */}
      {pinModal && (
        <div className="modal-backdrop" onClick={() => setPinModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">Reset PIN — {pinModal.name}</div>
            <div className="field">
              <label>New 4-Digit PIN</label>
              <input type="text" inputMode="numeric" maxLength={4} className="pin-input" placeholder="• • • •"
                value={newPin} onChange={e => setNewPin(e.target.value.replace(/\D/g,'').slice(0,4))} />
            </div>
            <div style={{ display:'flex', gap:8 }}>
              <button className="btn btn-primary" onClick={() => handleResetPin(pinModal)}>Save PIN</button>
              <button className="btn btn-secondary" onClick={() => setPinModal(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Rules Modal */}
      {editModal && (
        <div className="modal-backdrop" onClick={() => setEditModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">Scheduling Rules — {editModal.name}</div>
            <div style={{ marginBottom:12, padding:'8px 10px', background:'var(--bg)', borderRadius:'var(--radius)', fontSize:12, color:'var(--text-muted)' }}>
              Role: <strong>{editModal.role==='manager'?'Manager (min 35h/wk)':'Crew (max 28h/wk)'}</strong>
            </div>
            {[
              ['am_only',         'AM only',              'Only scheduled for morning shifts (7–2)'],
              ['pm_only',         'PM only',              'Only scheduled for evening/close shifts'],
              ['exempt_day_cap',  'Exempt 2-day cap',     'Can work more than 2 shifts per week'],
              ['weekend_weighted','Weekend-weighted',      'Prioritized for Sat/Sun shifts'],
              ['is_training',     'In training',          'Shown as Training on the schedule'],
            ].map(([field, label, desc]) => (
              <label key={field} style={{ display:'flex', alignItems:'flex-start', gap:10, padding:'10px 0', borderBottom:'1px solid var(--border)', cursor:'pointer' }}>
                <input type="checkbox" checked={!!editModal[field]}
                  onChange={async e => {
                    const val = e.target.checked ? 1 : 0;
                    await handleUpdateRule(editModal, field, val);
                    setEditModal(prev => ({ ...prev, [field]: val }));
                  }}
                  style={{ width:18, height:18, accentColor:'var(--primary)', flexShrink:0, marginTop:2 }}
                />
                <div>
                  <div style={{ fontSize:13, fontWeight:600 }}>{label}</div>
                  <div style={{ fontSize:11, color:'var(--text-muted)' }}>{desc}</div>
                </div>
              </label>
            ))}
            <div style={{ marginTop:16 }}>
              <button className="btn btn-secondary" onClick={() => setEditModal(null)}>Done</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
