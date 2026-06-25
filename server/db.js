// Thin better-sqlite3-compatible wrapper around node-sqlite3-wasm
// Converts @named params to ? and provides .prepare().all/get/run + .transaction()
const { Database: SqliteDb } = require('node-sqlite3-wasm');
const path = require('path');

const DB_PATH = path.join(__dirname, 'tigerwash.db');

// Convert @name style params to ? and extract ordered values from object
function processParams(sql, params) {
  if (params === undefined || params === null) return { sql, values: [] };
  if (Array.isArray(params)) return { sql, values: params };
  if (typeof params !== 'object') return { sql, values: [params] };

  const values = [];
  const newSql = sql.replace(/@(\w+)/g, (_, name) => {
    values.push(params[name] !== undefined ? params[name] : null);
    return '?';
  });
  return { sql: newSql, values };
}

class Stmt {
  constructor(db, sql) {
    this._db = db;
    this._sql = sql;
  }

  all(params) {
    const { sql, values } = processParams(this._sql, params);
    return this._db._raw.all(sql, values);
  }

  get(params) {
    const { sql, values } = processParams(this._sql, params);
    return this._db._raw.get(sql, values) || undefined;
  }

  run(params) {
    const { sql, values } = processParams(this._sql, params);
    return this._db._raw.run(sql, values);
  }
}

class DB {
  constructor(filePath) {
    this._raw = new SqliteDb(filePath);
    this._raw.run('PRAGMA journal_mode = WAL');
    this._raw.run('PRAGMA foreign_keys = ON');
  }

  prepare(sql) {
    return new Stmt(this, sql);
  }

  exec(sql) {
    // Split on ; and run each statement
    for (const stmt of sql.split(';')) {
      const s = stmt.trim();
      if (s) this._raw.run(s);
    }
  }

  pragma(pragma) {
    this._raw.run(`PRAGMA ${pragma}`);
  }

  transaction(fn) {
    return (...args) => {
      this._raw.run('BEGIN');
      try {
        const result = fn(...args);
        this._raw.run('COMMIT');
        return result;
      } catch (e) {
        this._raw.run('ROLLBACK');
        throw e;
      }
    };
  }

  prepare_run(sql, params) {
    const { sql: s, values } = processParams(sql, params);
    return this._raw.run(s, values);
  }

  all(sql, params) {
    const { sql: s, values } = processParams(sql, params);
    return this._raw.all(s, values);
  }

  get(sql, params) {
    const { sql: s, values } = processParams(sql, params);
    return this._raw.get(s, values) || undefined;
  }

  run(sql, params) {
    const { sql: s, values } = processParams(sql, params);
    return this._raw.run(s, values);
  }
}

let _db;

function getDb() {
  if (_db) return _db;
  _db = new DB(DB_PATH);
  initSchema(_db);
  runMigrations(_db);
  return _db;
}

function initSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS employees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      pin TEXT,
      role TEXT NOT NULL DEFAULT 'line',
      exempt_day_cap INTEGER DEFAULT 0,
      am_only INTEGER DEFAULT 0,
      pm_only INTEGER DEFAULT 0,
      days_allowed TEXT,
      weekend_weighted INTEGER DEFAULT 0,
      is_training INTEGER DEFAULT 0,
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS availability (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER NOT NULL,
      week_start TEXT NOT NULL,
      day_of_week INTEGER NOT NULL,
      mark TEXT NOT NULL,
      UNIQUE(employee_id, week_start, day_of_week),
      FOREIGN KEY (employee_id) REFERENCES employees(id)
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS schedule (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER NOT NULL,
      shift_date TEXT NOT NULL,
      shift_type TEXT NOT NULL,
      is_manual_override INTEGER DEFAULT 0,
      UNIQUE(employee_id, shift_date),
      FOREIGN KEY (employee_id) REFERENCES employees(id)
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS holidays (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      holiday_date TEXT NOT NULL UNIQUE,
      name TEXT
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS schedule_flags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shift_date TEXT NOT NULL,
      week_start TEXT NOT NULL,
      issue TEXT NOT NULL
    )
  `);
}

function runMigrations(db) {
  try { db.run('ALTER TABLE schedule ADD COLUMN custom_label TEXT'); } catch (_) {}
  try { db.run('ALTER TABLE availability ADD COLUMN is_recurring INTEGER DEFAULT 0'); } catch (_) {}
  try { db.run('ALTER TABLE availability ADD COLUMN needs_review INTEGER DEFAULT 0'); } catch (_) {}
  try { db.run('ALTER TABLE availability ADD COLUMN manager_note TEXT'); } catch (_) {}
  try {
    db.run(`CREATE TABLE IF NOT EXISTS published_weeks (
      week_start TEXT PRIMARY KEY,
      published_at TEXT DEFAULT (datetime('now'))
    )`);
  } catch (_) {}
}

module.exports = { getDb };
