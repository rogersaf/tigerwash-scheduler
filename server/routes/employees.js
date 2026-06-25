const express = require('express');
const { getDb } = require('../db');
const { requireAuth, requireManager } = require('./auth');

const router = express.Router();

router.get('/all-names', (req, res) => {
  const db = getDb();
  res.json(db.all('SELECT id, name FROM employees WHERE active = 1 ORDER BY name'));
});

router.get('/', requireAuth, (req, res) => {
  const db = getDb();
  if (req.user.role === 'manager') {
    return res.json(db.all("SELECT id,name,pin,role,exempt_day_cap,am_only,pm_only,days_allowed,weekend_weighted,is_training,active FROM employees ORDER BY CASE WHEN name='Nick' THEN 0 ELSE 1 END, role DESC, name"));
  }
  const row = db.get('SELECT id,name,role FROM employees WHERE id = ?', [req.user.id]);
  res.json(row ? [row] : []);
});

router.get('/:id', requireAuth, (req, res) => {
  const db = getDb();
  const id = parseInt(req.params.id);
  if (req.user.role !== 'manager' && req.user.id !== id) return res.status(403).json({ error: 'Forbidden' });
  const row = db.get('SELECT id,name,pin,role,exempt_day_cap,am_only,pm_only,days_allowed,weekend_weighted,is_training,active FROM employees WHERE id = ?', [id]);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(row);
});

router.post('/', requireManager, (req, res) => {
  const { name, role = 'line', exempt_day_cap = 0, am_only = 0, pm_only = 0,
    days_allowed = null, weekend_weighted = 0, is_training = 0 } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  const db = getDb();
  try {
    const r = db.run(
      'INSERT INTO employees (name,role,exempt_day_cap,am_only,pm_only,days_allowed,weekend_weighted,is_training) VALUES (?,?,?,?,?,?,?,?)',
      [name.trim(), role, exempt_day_cap, am_only, pm_only, days_allowed, weekend_weighted, is_training]
    );
    res.json({ id: r.lastInsertRowid });
  } catch (e) {
    if (String(e).includes('UNIQUE')) return res.status(400).json({ error: 'Employee name already exists' });
    throw e;
  }
});

router.patch('/:id', requireAuth, (req, res) => {
  const db = getDb();
  const id = parseInt(req.params.id);
  const body = req.body;

  if (req.user.role !== 'manager') {
    if (req.user.id !== id) return res.status(403).json({ error: 'Forbidden' });
    if (!body.pin) return res.status(400).json({ error: 'Only PIN changes allowed' });
    if (!/^\d{4}$/.test(String(body.pin))) return res.status(400).json({ error: 'PIN must be exactly 4 digits' });
    db.run('UPDATE employees SET pin = ? WHERE id = ?', [String(body.pin), id]);
    return res.json({ ok: true });
  }

  const cur = db.get('SELECT * FROM employees WHERE id = ?', [id]);
  if (!cur) return res.status(404).json({ error: 'Not found' });

  db.run(
    `UPDATE employees SET name=?,role=?,exempt_day_cap=?,am_only=?,pm_only=?,days_allowed=?,weekend_weighted=?,is_training=?,active=?,pin=COALESCE(?,pin) WHERE id=?`,
    [
      body.name ?? cur.name,
      body.role ?? cur.role,
      body.exempt_day_cap ?? cur.exempt_day_cap,
      body.am_only ?? cur.am_only,
      body.pm_only ?? cur.pm_only,
      body.days_allowed ?? cur.days_allowed,
      body.weekend_weighted ?? cur.weekend_weighted,
      body.is_training ?? cur.is_training,
      body.active ?? cur.active,
      body.pin ? String(body.pin) : null,
      id,
    ]
  );
  res.json({ ok: true });
});

router.delete('/:id', requireManager, (req, res) => {
  const db = getDb();
  db.run('UPDATE employees SET active = 0 WHERE id = ?', [parseInt(req.params.id)]);
  res.json({ ok: true });
});

module.exports = router;
