const express = require('express');
const { getDb } = require('../db');
const { requireAuth, requireManager } = require('./auth');

const router = express.Router();

router.get('/', requireAuth, (req, res) => {
  res.json(getDb().all('SELECT * FROM holidays ORDER BY holiday_date'));
});

router.post('/', requireManager, (req, res) => {
  const { holiday_date, name } = req.body;
  if (!holiday_date) return res.status(400).json({ error: 'holiday_date required' });
  try {
    getDb().run('INSERT INTO holidays (holiday_date, name) VALUES (?,?)', [holiday_date, name || null]);
    res.json({ ok: true });
  } catch {
    res.status(400).json({ error: 'Date already marked as holiday' });
  }
});

router.delete('/:date', requireManager, (req, res) => {
  getDb().run('DELETE FROM holidays WHERE holiday_date = ?', [req.params.date]);
  res.json({ ok: true });
});

module.exports = router;
