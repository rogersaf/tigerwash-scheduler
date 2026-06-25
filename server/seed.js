const { getDb } = require('./db');
const db = getDb();

const employees = [
  { name: 'Nick',   pin: '1111', role: 'manager', exempt_day_cap: 1, am_only: 0, pm_only: 0, days_allowed: null, weekend_weighted: 0, is_training: 0 },
  { name: 'Angel',  pin: '2222', role: 'manager', exempt_day_cap: 1, am_only: 0, pm_only: 0, days_allowed: null, weekend_weighted: 0, is_training: 0 },
  { name: 'Jesse',  pin: '1001', role: 'line',    exempt_day_cap: 0, am_only: 0, pm_only: 0, days_allowed: null, weekend_weighted: 0, is_training: 0 },
  { name: 'James',  pin: '1002', role: 'line',    exempt_day_cap: 1, am_only: 1, pm_only: 0, days_allowed: null, weekend_weighted: 0, is_training: 0 },
  { name: 'Eduardo',pin: '1003', role: 'line',    exempt_day_cap: 0, am_only: 1, pm_only: 0, days_allowed: '[3,4,5]', weekend_weighted: 0, is_training: 0 },
  { name: 'Sam',    pin: '1004', role: 'line',    exempt_day_cap: 0, am_only: 0, pm_only: 1, days_allowed: null, weekend_weighted: 0, is_training: 0 },
  { name: 'Cayden', pin: '1005', role: 'line',    exempt_day_cap: 0, am_only: 0, pm_only: 0, days_allowed: null, weekend_weighted: 0, is_training: 0 },
  { name: 'Colton', pin: '1006', role: 'line',    exempt_day_cap: 1, am_only: 0, pm_only: 0, days_allowed: null, weekend_weighted: 0, is_training: 0 },
  { name: 'Kaden',  pin: '1007', role: 'line',    exempt_day_cap: 0, am_only: 0, pm_only: 0, days_allowed: null, weekend_weighted: 0, is_training: 0 },
  { name: 'Q',      pin: '1008', role: 'line',    exempt_day_cap: 0, am_only: 0, pm_only: 0, days_allowed: null, weekend_weighted: 0, is_training: 0 },
  { name: 'Allie',  pin: '1009', role: 'line',    exempt_day_cap: 0, am_only: 1, pm_only: 0, days_allowed: null, weekend_weighted: 0, is_training: 0 },
  { name: 'Derek',  pin: '1010', role: 'line',    exempt_day_cap: 0, am_only: 0, pm_only: 1, days_allowed: null, weekend_weighted: 0, is_training: 0 },
  { name: 'Wil H',  pin: '1011', role: 'line',    exempt_day_cap: 0, am_only: 0, pm_only: 0, days_allowed: null, weekend_weighted: 1, is_training: 0 },
  { name: 'Jordan', pin: '1012', role: 'line',    exempt_day_cap: 0, am_only: 0, pm_only: 0, days_allowed: null, weekend_weighted: 1, is_training: 0 },
  { name: 'Blaine', pin: '1013', role: 'line',    exempt_day_cap: 0, am_only: 0, pm_only: 0, days_allowed: null, weekend_weighted: 0, is_training: 1 },
];

const seedTx = db.transaction(() => {
  for (const e of employees) {
    db.run(
      'INSERT OR IGNORE INTO employees (name, pin, role, exempt_day_cap, am_only, pm_only, days_allowed, weekend_weighted, is_training) VALUES (?,?,?,?,?,?,?,?,?)',
      [e.name, e.pin, e.role, e.exempt_day_cap, e.am_only, e.pm_only, e.days_allowed, e.weekend_weighted, e.is_training]
    );
  }

  // July 4th holiday
  db.run("INSERT OR IGNORE INTO holidays (holiday_date, name) VALUES ('2025-07-04', 'Independence Day')");

  // Standing availability from Excel (week_start = 2025-06-29, 0=Mon…6=Sun)
  const avail = [
    ['James',   0,'PM'],['James',   1,'PM'],['James',   2,'PM'],['James',   3,'PM'],['James',   4,'PM'],['James',   5,'PM'],['James',   6,'PM'],
    ['Eduardo', 0,'X'], ['Eduardo', 1,'X'], ['Eduardo', 2,'X'], ['Eduardo', 3,'PM'],['Eduardo', 4,'PM'],['Eduardo', 5,'PM'],['Eduardo', 6,'X'],
    ['Sam',     0,'AM'],['Sam',     1,'AM'],['Sam',     2,'AM'],['Sam',     3,'AM'],['Sam',     4,'AM'],['Sam',     5,'AM'],['Sam',     6,'AM'],
    ['Allie',   0,'PM'],['Allie',   1,'PM'],['Allie',   2,'PM'],['Allie',   3,'PM'],['Allie',   4,'PM'],['Allie',   5,'PM'],['Allie',   6,'PM'],
    ['Derek',   0,'AM'],['Derek',   1,'AM'],['Derek',   2,'AM'],['Derek',   3,'AM'],['Derek',   4,'AM'],['Derek',   5,'AM'],['Derek',   6,'AM'],
  ];
  const weekStart = '2025-06-29';
  for (const [name, day, mark] of avail) {
    const emp = db.get('SELECT id FROM employees WHERE name = ?', [name]);
    if (emp) {
      db.run(
        'INSERT OR IGNORE INTO availability (employee_id, week_start, day_of_week, mark) VALUES (?,?,?,?)',
        [emp.id, weekStart, day, mark]
      );
    }
  }
});

seedTx();
console.log(`Seeded ${employees.length} employees.`);
