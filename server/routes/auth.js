const express = require('express');
const jwt = require('jsonwebtoken');
const { getDb } = require('../db');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'tigerwash-secret-2025';

router.post('/login', (req, res) => {
  const { name, pin } = req.body;
  if (!name || !pin) return res.status(400).json({ error: 'Name and PIN required' });
  const db = getDb();
  const emp = db.get('SELECT * FROM employees WHERE LOWER(name) = LOWER(?) AND active = 1', [name.trim()]);
  if (!emp) return res.status(401).json({ error: 'Employee not found' });
  if (!emp.pin) return res.status(401).json({ error: 'No PIN set — please create your account first' });
  if (emp.pin !== String(pin)) return res.status(401).json({ error: 'Incorrect PIN' });
  const token = jwt.sign({ id: emp.id, name: emp.name, role: emp.role }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, user: { id: emp.id, name: emp.name, role: emp.role } });
});

router.post('/create-account', (req, res) => {
  const { name, pin } = req.body;
  if (!name || !pin) return res.status(400).json({ error: 'Name and PIN required' });
  if (!/^\d{4}$/.test(String(pin))) return res.status(400).json({ error: 'PIN must be exactly 4 digits' });
  const db = getDb();
  const emp = db.get('SELECT * FROM employees WHERE LOWER(name) = LOWER(?) AND active = 1', [name.trim()]);
  if (!emp) return res.status(404).json({ error: 'Employee not found. Ask your manager to add you.' });
  if (emp.pin) return res.status(400).json({ error: 'Account already exists. Please sign in.' });
  db.run('UPDATE employees SET pin = ? WHERE id = ?', [String(pin), emp.id]);
  const token = jwt.sign({ id: emp.id, name: emp.name, role: emp.role }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, user: { id: emp.id, name: emp.name, role: emp.role } });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

router.get('/pending-accounts', (req, res) => {
  const db = getDb();
  res.json(db.all('SELECT id, name FROM employees WHERE pin IS NULL AND active = 1 ORDER BY name'));
});

function requireAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  try {
    req.user = jwt.verify(auth.slice(7), JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

function requireManager(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== 'manager') return res.status(403).json({ error: 'Manager access required' });
    next();
  });
}

module.exports = { router, requireAuth, requireManager };
