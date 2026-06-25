const express = require('express');
const { getDb } = require('../db');
const { requireAuth, requireManager } = require('./auth');
const { generateSchedule, addDays } = require('../engine/scheduler');

const router = express.Router();

function weekShifts(db, week_start) {
  const weekEnd = addDays(week_start, 6);
  return db.all(
    `SELECT s.id, s.employee_id, s.shift_date, s.shift_type, s.is_manual_override,
            e.name as employee_name, e.role as employee_role
     FROM schedule s JOIN employees e ON e.id = s.employee_id
     WHERE s.shift_date >= ? AND s.shift_date <= ?
     ORDER BY s.shift_date, CASE WHEN e.name='Nick' THEN 0 ELSE 1 END, e.name`,
    [week_start, weekEnd]
  );
}

function isPublished(db, week_start) {
  return !!db.get('SELECT 1 FROM published_weeks WHERE week_start = ?', [week_start]);
}

router.get('/', requireAuth, (req, res) => {
  const db = getDb();
  const { week_start } = req.query;
  if (!week_start) return res.status(400).json({ error: 'week_start required' });
  const weekEnd = addDays(week_start, 6);

  const published = isPublished(db, week_start);
  const holidays = db.all('SELECT * FROM holidays WHERE holiday_date >= ? AND holiday_date <= ?', [week_start, weekEnd]);

  // Employees only see the schedule once a manager has posted it
  if (req.user.role !== 'manager' && !published) {
    return res.json({ shifts: [], flags: [], holidays, published: false });
  }

  const shifts = weekShifts(db, week_start);
  const flags = db.all('SELECT * FROM schedule_flags WHERE week_start = ?', [week_start]);
  res.json({ shifts, flags, holidays, published });
});

router.post('/generate', requireManager, (req, res) => {
  const db = getDb();
  const { week_start } = req.query;
  if (!week_start) return res.status(400).json({ error: 'week_start required' });
  const weekEnd = addDays(week_start, 6);

  db.run('DELETE FROM schedule WHERE shift_date >= ? AND shift_date <= ? AND is_manual_override = 0', [week_start, weekEnd]);
  db.run('DELETE FROM schedule_flags WHERE week_start = ?', [week_start]);

  const { schedule, flags } = generateSchedule(week_start, db);

  // Collect existing manual overrides so generate doesn't blow them away
  const manualKeys = new Set(
    db.all('SELECT employee_id, shift_date FROM schedule WHERE shift_date >= ? AND shift_date <= ? AND is_manual_override = 1', [week_start, weekEnd])
      .map(r => `${r.employee_id}:${r.shift_date}`)
  );

  db.transaction(() => {
    for (const s of schedule) {
      // Never overwrite a manual override
      if (manualKeys.has(`${s.employee_id}:${s.shift_date}`)) continue;
      db.run(
        'INSERT OR IGNORE INTO schedule (employee_id, shift_date, shift_type, is_manual_override) VALUES (?,?,?,0)',
        [s.employee_id, s.shift_date, s.shift_type]
      );
    }
    for (const f of flags) {
      db.run('INSERT INTO schedule_flags (shift_date, week_start, issue) VALUES (?,?,?)', [f.shift_date, f.week_start, f.issue]);
    }
  })();

  const published = isPublished(db, week_start);
  res.json({ shifts: weekShifts(db, week_start), flags, generated: true, published });
});

router.post('/publish', requireManager, (req, res) => {
  const db = getDb();
  const { week_start } = req.query;
  if (!week_start) return res.status(400).json({ error: 'week_start required' });
  db.run('INSERT OR REPLACE INTO published_weeks (week_start) VALUES (?)', [week_start]);
  res.json({ ok: true, published: true });
});

router.delete('/publish', requireManager, (req, res) => {
  const db = getDb();
  const { week_start } = req.query;
  if (!week_start) return res.status(400).json({ error: 'week_start required' });
  db.run('DELETE FROM published_weeks WHERE week_start = ?', [week_start]);
  res.json({ ok: true, published: false });
});

router.put('/override', requireManager, (req, res) => {
  const db = getDb();
  const { employee_id, shift_date, shift_type, custom_label } = req.body;
  if (!employee_id || !shift_date || !shift_type) return res.status(400).json({ error: 'employee_id, shift_date, shift_type required' });
  // Store whatever the manager typed as shift_type directly — no custom_label column needed
  const storedType = custom_label ? custom_label.trim() : shift_type;
  try {
    db.run('DELETE FROM schedule WHERE employee_id = ? AND shift_date = ?', [employee_id, shift_date]);
    db.run(
      'INSERT INTO schedule (employee_id, shift_date, shift_type, is_manual_override) VALUES (?,?,?,1)',
      [employee_id, shift_date, storedType]
    );
  } catch (err) {
    return res.status(500).json({ error: 'DB error: ' + err.message });
  }
  res.json({ ok: true, storedType });
});

router.delete('/override', requireManager, (req, res) => {
  const db = getDb();
  const { employee_id, shift_date } = req.body;
  db.run('DELETE FROM schedule WHERE employee_id = ? AND shift_date = ? AND is_manual_override = 1', [employee_id, shift_date]);
  res.json({ ok: true });
});

router.delete('/clear', requireManager, (req, res) => {
  const db = getDb();
  const { week_start } = req.query;
  if (!week_start) return res.status(400).json({ error: 'week_start required' });
  const weekEnd = addDays(week_start, 6);
  const before = weekShifts(db, week_start);
  db.run('DELETE FROM schedule WHERE shift_date >= ? AND shift_date <= ?', [week_start, weekEnd]);
  db.run('DELETE FROM schedule_flags WHERE week_start = ?', [week_start]);
  res.json({ ok: true, cleared: before });
});

module.exports = router;
