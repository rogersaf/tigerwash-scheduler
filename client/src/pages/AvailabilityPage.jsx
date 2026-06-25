import React, { useState, useEffect } from 'react';
import { api, currentWeekStart, addDays, DAY_NAMES, formatDate } from '../api';
import { useAuth } from '../App';

// All options — value '' = fully available
const STD_OPTS = [
  { value: '',    label: 'Available',           icon: '✅', cls: 'opt-free' },
  { value: 'X',   label: 'Off all day',          icon: '🚫', cls: 'opt-off'  },
  { value: 'AM',  label: 'No mornings (7–2)',    icon: '🌅', cls: 'opt-am'   },
  { value: 'MID', label: 'No mids (11–6)',       icon: '🌤', cls: 'opt-mid'  },
  { value: 'PM',  label: 'No evenings (2–close)',icon: '🌙', cls: 'opt-pm'   },
];

const KNOWN = ['', 'X', 'AM', 'MID', 'PM'];
function isCustom(val) { return val != null && !KNOWN.includes(val); }

export default function AvailabilityPage() {
  const { user } = useAuth();
  const [weekStart, setWeekStart] = useState(currentWeekStart());
  const [marks, setMarks] = useState({});         // dayIndex → mark string
  const [savedMarks, setSavedMarks] = useState({}); // last-saved state per day
  const [customText, setCustomText] = useState({}); // dayIndex → custom text
  const [holidays, setHolidays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingDay, setSavingDay] = useState(null); // dayIndex being saved, or 'all'
  const [dayMsg, setDayMsg] = useState({});        // dayIndex → {type, text}
  const [globalMsg, setGlobalMsg] = useState('');
  const [isRecurring, setIsRecurring] = useState(false);
  const [undoMarks, setUndoMarks] = useState(null);

  useEffect(() => {
    setLoading(true);
    setDayMsg({}); setGlobalMsg('');
    Promise.all([api.availability(weekStart, user.id), api.holidays()])
      .then(([avRows, hols]) => {
        const m = {}, ct = {};
        for (const r of avRows) {
          m[r.day_of_week] = r.mark;
          if (isCustom(r.mark)) ct[r.day_of_week] = r.mark;
        }
        setMarks({ ...m });
        setSavedMarks({ ...m });
        setCustomText(ct);
        setIsRecurring(avRows.some((r) => r.source === 'recurring'));
        setHolidays(hols.map((h) => h.holiday_date));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [weekStart]);

  // Toggle: clicking same option deselects → back to available
  function handleToggle(dayIndex, value) {
    setMarks((prev) => ({ ...prev, [dayIndex]: prev[dayIndex] === value ? '' : value }));
    setDayMsg((prev) => ({ ...prev, [dayIndex]: null }));
    setGlobalMsg('');
  }

  function handleCustomSelect(dayIndex) {
    const txt = customText[dayIndex] || '';
    setMarks((prev) => ({
      ...prev,
      [dayIndex]: isCustom(prev[dayIndex]) ? '' : (txt || 'CUSTOM'),
    }));
    setDayMsg((prev) => ({ ...prev, [dayIndex]: null }));
  }

  function handleCustomText(dayIndex, text) {
    setCustomText((prev) => ({ ...prev, [dayIndex]: text }));
    setMarks((prev) => ({ ...prev, [dayIndex]: text || 'CUSTOM' }));
  }

  // Save a single day
  async function saveSingleDay(dayIndex) {
    const current = marks[dayIndex] ?? '';
    const saved = savedMarks[dayIndex] ?? '';
    if (current === saved) {
      setDayMsg((prev) => ({ ...prev, [dayIndex]: { type: 'info', text: 'No change.' } }));
      return;
    }
    setSavingDay(dayIndex);
    try {
      await api.confirmAvailability(weekStart, [{ day_of_week: dayIndex, mark: current || null }], isRecurring);
      setSavedMarks((prev) => ({ ...prev, [dayIndex]: current }));
      setDayMsg((prev) => ({ ...prev, [dayIndex]: { type: 'ok', text: isRecurring ? 'Saved (weekly)' : 'Saved!' } }));
    } catch (err) {
      const blocked = err.message.includes('breaks coverage');
      setDayMsg((prev) => ({
        ...prev,
        [dayIndex]: { type: 'err', text: blocked ? '⚠ Breaks coverage — speak with manager.' : err.message },
      }));
      // Revert local change
      setMarks((prev) => ({ ...prev, [dayIndex]: saved }));
    } finally {
      setSavingDay(null);
    }
  }

  // Save all dirty days at once
  async function saveAllDays() {
    const changes = [];
    for (let d = 0; d < 7; d++) {
      const current = marks[d] ?? '';
      const saved = savedMarks[d] ?? '';
      if (current !== saved) changes.push({ day_of_week: d, mark: current || null });
    }
    if (changes.length === 0) { setGlobalMsg('No changes.'); return; }
    setSavingDay('all');
    try {
      setUndoMarks({ ...savedMarks });
      await api.confirmAvailability(weekStart, changes, isRecurring);
      const next = { ...savedMarks };
      for (const c of changes) next[c.day_of_week] = c.mark ?? '';
      setSavedMarks(next);
      setGlobalMsg(isRecurring ? '✓ Saved as weekly schedule.' : '✓ Availability saved.');
      setDayMsg({});
    } catch (err) {
      const blocked = err.message.includes('breaks coverage');
      setGlobalMsg(blocked ? '⚠ Change breaks coverage — speak with your manager.' : err.message);
    } finally {
      setSavingDay(null);
    }
  }

  function handleUndo() {
    if (!undoMarks) return;
    const ct = {};
    for (const [k, v] of Object.entries(undoMarks)) {
      if (isCustom(v)) ct[k] = v;
    }
    setMarks({ ...undoMarks });
    setCustomText(ct);
    setUndoMarks(null);
    setGlobalMsg('');
  }

  function isDirty(d) { return (marks[d] ?? '') !== (savedMarks[d] ?? ''); }
  const anyDirty = DAY_NAMES.some((_, d) => isDirty(d));
  const weekEnd = addDays(weekStart, 6);

  return (
    <>
      <div className="page-header">
        <div className="page-title">My Availability</div>
        <div className="page-subtitle">
          Tap an option to mark a restriction — then tap <strong>Save</strong> on that day (or <strong>Save All</strong> below).
        </div>
      </div>

      <div className="page-body">
        <div className="week-nav">
          <button className="btn btn-secondary btn-sm" onClick={() => setWeekStart(addDays(weekStart, -7))}>← Prev</button>
          <span className="week-label">{formatDate(weekStart)} — {formatDate(weekEnd)}</span>
          <button className="btn btn-secondary btn-sm" onClick={() => setWeekStart(addDays(weekStart, 7))}>Next →</button>
        </div>

        {globalMsg && (
          <div className={`alert ${globalMsg.startsWith('⚠') ? 'alert-warning' : globalMsg.startsWith('✓') ? 'alert-success' : 'alert-info'}`}>
            {globalMsg}
          </div>
        )}

        {loading ? (
          <div className="text-muted text-sm">Loading…</div>
        ) : (
          <div className="avail-grid">
            {DAY_NAMES.map((dayName, d) => {
              const date = addDays(weekStart, d);
              const isHol = holidays.includes(date);
              const currentMark = marks[d] ?? '';
              const dayIsCustom = isCustom(currentMark);
              const dirty = isDirty(d);
              const msg = dayMsg[d];
              const isSaving = savingDay === d;

              return (
                <div key={d} className={`avail-day-card${currentMark ? ' has-mark' : ''}${isHol ? ' holiday' : ''}${dirty ? ' dirty' : ''}`}>
                  <div className="avail-day-header">
                    <div className="avail-day-name">{dayName}</div>
                    <div className="avail-day-date">{new Date(date + 'T12:00:00').getDate()}</div>
                    {isHol && <div style={{ fontSize:10, color:'var(--warning)', fontWeight:600 }}>CLOSED</div>}
                  </div>

                  {isHol ? (
                    <div style={{ padding:'10px', textAlign:'center', fontSize:12, color:'var(--warning)' }}>Holiday</div>
                  ) : (
                    <div className="avail-toggles">
                      {STD_OPTS.map((opt) => (
                        <button
                          key={opt.value}
                          className={`avail-toggle-btn ${opt.cls}${currentMark === opt.value ? ' active' : ''}`}
                          onClick={() => handleToggle(d, opt.value)}
                          type="button"
                        >
                          <span>{opt.icon}</span>
                          <span className="toggle-label">{opt.label}</span>
                        </button>
                      ))}

                      {/* Custom option */}
                      <button
                        className={`avail-toggle-btn opt-custom${dayIsCustom ? ' active' : ''}`}
                        onClick={() => handleCustomSelect(d)}
                        type="button"
                      >
                        <span>✏️</span>
                        <span className="toggle-label">Custom note</span>
                      </button>

                      {dayIsCustom && (
                        <input
                          type="text"
                          className="avail-custom-input"
                          placeholder="e.g. Available after 3pm"
                          value={customText[d] || ''}
                          onChange={(e) => handleCustomText(d, e.target.value)}
                        />
                      )}

                      {/* Per-day save button */}
                      {dirty && (
                        <button
                          className="btn btn-primary btn-sm"
                          style={{ marginTop:5, width:'100%' }}
                          onClick={() => saveSingleDay(d)}
                          disabled={isSaving}
                        >
                          {isSaving ? '…' : '✓ Save'}
                        </button>
                      )}

                      {/* Per-day feedback */}
                      {msg && (
                        <div style={{
                          fontSize:10,
                          marginTop:3,
                          padding:'3px 5px',
                          borderRadius:4,
                          color: msg.type === 'ok' ? 'var(--success)' : msg.type === 'err' ? 'var(--danger)' : 'var(--text-muted)',
                          background: msg.type === 'ok' ? 'var(--success-light)' : msg.type === 'err' ? 'var(--danger-light)' : 'transparent',
                        }}>
                          {msg.text}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Recurring toggle */}
        <label className="recurring-toggle">
          <input
            type="checkbox"
            checked={isRecurring}
            onChange={(e) => setIsRecurring(e.target.checked)}
          />
          <span>
            <strong>Set as my weekly schedule</strong> — repeats every week automatically
          </span>
        </label>
        {isRecurring && (
          <p className="text-sm text-muted" style={{ marginBottom:12 }}>
            Saves as your default. Override any specific week by unchecking this first.
          </p>
        )}

        <div className="avail-actions">
          <button
            className="btn btn-primary btn-lg"
            style={{ flex:1 }}
            onClick={saveAllDays}
            disabled={savingDay === 'all' || loading || !anyDirty}
          >
            {savingDay === 'all' ? 'Saving…' : isRecurring ? '💾 Save Weekly Schedule' : '✓ Save All Changes'}
          </button>
          {undoMarks && (
            <button className="btn btn-secondary" onClick={handleUndo}>↩ Undo</button>
          )}
        </div>
        {anyDirty && <p className="text-sm text-muted" style={{ marginTop:8 }}>You have unsaved changes</p>}
      </div>
    </>
  );
}
