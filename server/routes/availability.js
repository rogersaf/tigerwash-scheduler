const express = require('express');
const { getDb } = require('../db');
const { requireAuth, requireManager } = require('./auth');
const { wouldBreakCoverage, addDays } = require('../engine/scheduler');

const router = express.Router();

const KNOWN_MARKS = ['', 'X', 'AM', 'MID', 'PM'];
function isCustom(mark) { return mark && !KNOWN_MARKS.includes(mark); }
function needsReview(mark) { return mark === 'X' || isCustom(mark); }

// Merge recurring + week-specific (week-specific wins per day)
function getAvailability(db, employee_id, week_start) {
  const recurring = db.all("SELECT * FROM availability WHERE employee_id = ? AND week_start = 'recurring'", [employee_id]);
  const weekly = db.all('SELECT * FROM availability WHERE employee_id = ? AND week_start = ?', [employee_id, week_start]);
  const map = {};
  for (const r of recurring) map[r.day_of_week] = { ...r, source: 'recurring' };
  for (const r of weekly)   map[r.day_of_week] = { ...r, source: 'week' };
  return Object.values(map);
}

router.get('/', requireAuth, (req, res) => {
  const db = getDb();
  const { week_start, employee_id } = req.query;
  if (!week_start) return res.status(400).json({ error: 'week_start required' });

  if (req.user.role === 'manager') {
    if (employee_id) return res.json(getAvailability(db, parseInt(employee_id), week_start));
    const allWeekly   = db.all('SELECT * FROM availability WHERE week_start = ?', [week_start]);
    const allRecurring = db.all("SELECT * FROM availability WHERE week_start = 'recurring'");
    const map = {};
    for (const r of allRecurring) {
      if (!map[r.employee_id]) map[r.employee_id] = {};
      map[r.employee_id][r.day_of_week] = { ...r, source: 'recurring' };
    }
    for (const r of allWeekly) {
      if (!map[r.employee_id]) map[r.employee_id] = {};
      map[r.employee_id][r.day_of_week] = { ...r, source: 'week' };
    }
    return res.json(Object.values(map).flatMap(m => Object.values(m)));
  }

  res.json(getAvailability(db, req.user.id, week_start));
});

// Employee confirms their own availability
router.post('/confirm', requireAuth, (req, res) => {
  const db = getDb();
  const { week_start, marks, is_recurring } = req.body;
  const employee_id = req.user.id;
  if (!week_start || !Array.isArray(marks)) return res.status(400).json({ error: 'week_start and marks required' });

  const breaks = wouldBreakCoverage(employee_id, week_start, marks, db);
  if (breaks) return res.status(409).json({ error: 'This change breaks coverage. Please speak with your manager.', blocked: true });

  const target = is_recurring ? 'recurring' : week_start;

  db.transaction(() => {
    for (const { day_of_week, mark } of marks) {
      if (!mark) {
        db.run('DELETE FROM availability WHERE employee_id = ? AND week_start = ? AND day_of_week = ?', [employee_id, target, day_of_week]);
      } else {
        db.run(
          'INSERT OR REPLACE INTO availability (employee_id, week_start, day_of_week, mark, needs_review) VALUES (?,?,?,?,?)',
          [employee_id, target, day_of_week, mark, needsReview(mark) ? 1 : 0]
        );
      }
    }
  })();

  res.json({ ok: true });
});

// Manager sets availability for an employee (no coverage guard, no needs_review)
router.put('/manager', requireManager, (req, res) => {
  const db = getDb();
  const { employee_id, week_start, marks } = req.body;
  if (!employee_id || !week_start || !Array.isArray(marks)) return res.status(400).json({ error: 'employee_id, week_start, marks required' });

  db.transaction(() => {
    for (const { day_of_week, mark, manager_note } of marks) {
      if (!mark) {
        db.run('DELETE FROM availability WHERE employee_id = ? AND week_start = ? AND day_of_week = ?', [employee_id, week_start, day_of_week]);
      } else {
        db.run(
          'INSERT OR REPLACE INTO availability (employee_id, week_start, day_of_week, mark, needs_review, manager_note) VALUES (?,?,?,?,0,?)',
          [employee_id, week_start, day_of_week, mark, manager_note || null]
        );
      }
    }
  })();

  res.json({ ok: true });
});

// Manager approves a pending availability row (clears needs_review, optionally adds a note)
// If the approved mark is X (day off) and a schedule entry exists for that date, remove it.
router.post('/approve', requireManager, (req, res) => {
  const db = getDb();
  const { employee_id, week_start, day_of_week, manager_note } = req.body;

  const row = db.get(
    'SELECT mark FROM availability WHERE employee_id = ? AND week_start = ? AND day_of_week = ?',
    [employee_id, week_start, day_of_week]
  );

  db.run(
    'UPDATE availability SET needs_review = 0, manager_note = ? WHERE employee_id = ? AND week_start = ? AND day_of_week = ?',
    [manager_note || null, employee_id, week_start, day_of_week]
  );

  let scheduleUpdated = false;
  if (row?.mark === 'X' && week_start && week_start !== 'recurring') {
    const shiftDate = addDays(week_start, day_of_week);
    const del = db.run('DELETE FROM schedule WHERE employee_id = ? AND shift_date = ?', [employee_id, shiftDate]);
    scheduleUpdated = del.changes > 0;
  }

  res.json({ ok: true, scheduleUpdated, mark: row?.mark });
});

// All pending items (needs_review=1) across all employees
router.get('/pending', requireManager, (req, res) => {
  const db = getDb();
  const rows = db.all(`
    SELECT a.*, e.name as employee_name
    FROM availability a
    JOIN employees e ON e.id = a.employee_id
    WHERE a.needs_review = 1
    ORDER BY a.week_start, e.name, a.day_of_week
  `);
  res.json(rows);
});

// Status summary for each employee for a given week
router.get('/status', requireManager, (req, res) => {
  const db = getDb();
  const { week_start } = req.query;
  if (!week_start) return res.status(400).json({ error: 'week_start required' });

  const employees = db.all("SELECT id, name, role FROM employees WHERE active = 1 ORDER BY CASE WHEN name='Nick' THEN 0 ELSE 1 END, role DESC, name");
  const weeklyRows   = db.all('SELECT DISTINCT employee_id FROM availability WHERE week_start = ?', [week_start]);
  const recurringRows = db.all("SELECT DISTINCT employee_id FROM availability WHERE week_start = 'recurring'");
  const pendingRows  = db.all('SELECT DISTINCT employee_id FROM availability WHERE needs_review = 1');

  const hasWeekly   = new Set(weeklyRows.map(r => r.employee_id));
  const hasRecurring = new Set(recurringRows.map(r => r.employee_id));
  const hasPending  = new Set(pendingRows.map(r => r.employee_id));

  res.json(employees.map(e => ({
    employee_id:  e.id,
    name:         e.name,
    role:         e.role,
    submitted:    hasWeekly.has(e.id) || hasRecurring.has(e.id),
    week_specific: hasWeekly.has(e.id),
    recurring:    hasRecurring.has(e.id),
    has_pending:  hasPending.has(e.id),
  })));
});

module.exports = router;
