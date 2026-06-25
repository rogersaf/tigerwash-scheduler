// Import the July Week 1 schedule from the Excel file into the DB
const { getDb } = require('./db');
const db = getDb();

// Date map
const D = {
  Mon: '2025-06-29',
  Tue: '2025-06-30',
  Wed: '2025-07-01',
  Thu: '2025-07-02',
  Fri: '2025-07-03',
  Sat: '2025-07-04', // CLOSED
  Sun: '2025-07-05',
};

// Shift label → shift_type
function shiftType(s) {
  if (!s || s === '') return null;
  s = s.toLowerCase().trim();
  if (s.includes('8-4'))   return 'MANAGER';
  if (s.startsWith('7'))   return 'AM';
  if (s.startsWith('10'))  return 'MID';
  if (s.startsWith('11'))  return 'MID';
  if (s.includes('close') || s.startsWith('2') || s.startsWith('9')) return 'PM';
  return 'AM';
}

// From Excel Sheet1 (only non-empty cells)
const rawSchedule = [
  // Nick — MANAGER Mon-Fri
  ['Nick',   'Mon','8-4'],
  ['Nick',   'Tue','8-4'],
  ['Nick',   'Wed','8-4'],
  ['Nick',   'Thu','8-4'],
  ['Nick',   'Fri','8-4'],
  // Angel
  ['Angel',  'Tue','2-close'],
  ['Angel',  'Wed','10-6'],
  ['Angel',  'Thu','10-6'],
  ['Angel',  'Fri','11-3'],
  ['Angel',  'Sun','9-close'],
  // Jesse
  ['Jesse',  'Mon','2-close'],
  ['Jesse',  'Wed','2-close'],
  // James
  ['James',  'Mon','7-2'],
  ['James',  'Tue','7-2'],
  ['James',  'Wed','7-2'],
  // Eduardo
  ['Eduardo','Thu','7-1'],
  ['Eduardo','Fri','7-1'],
  // Sam
  ['Sam',    'Mon','2-close'],
  ['Sam',    'Wed','2-close'],
  // Colton
  ['Colton', 'Thu','7-2'],
  ['Colton', 'Fri','7-2'],
  // Q
  ['Q',      'Tue','7-2'],
  ['Q',      'Thu','2-close'],
  // Allie
  ['Allie',  'Mon','7-2'],
  ['Allie',  'Wed','7-2'],
  // Derek
  ['Derek',  'Tue','2-close'],
  ['Derek',  'Thu','2-close'],
  // Wil H
  ['Wil H',  'Fri','2-close'],
  ['Wil H',  'Sun','11-close'],
  // Jordan
  ['Jordan', 'Fri','2-close'],
  ['Jordan', 'Sun','9-close'],
  // Blaine (training)
  ['Blaine', 'Tue','2-close'],
  ['Blaine', 'Wed','10-6'],
  ['Blaine', 'Sun','9-close'],
];

const weekStart = '2025-06-29';

// Clear any existing auto-fill for this week, keep structure
db.run("DELETE FROM schedule WHERE shift_date >= '2025-06-29' AND shift_date <= '2025-07-05'");
db.run("DELETE FROM schedule_flags WHERE week_start = '2025-06-29'");

let inserted = 0;
const tx = db.transaction(() => {
  for (const [name, day, shift] of rawSchedule) {
    const emp = db.get('SELECT id FROM employees WHERE LOWER(name) = LOWER(?)', [name]);
    if (!emp) { console.warn('  Not found:', name); continue; }
    const date = D[day];
    const type = shiftType(shift);
    if (!type) continue;
    db.run(
      'INSERT OR REPLACE INTO schedule (employee_id, shift_date, shift_type, is_manual_override) VALUES (?,?,?,1)',
      [emp.id, date, type]
    );
    console.log(`  ${name} ${day} ${shift} → ${type}`);
    inserted++;
  }
});
tx();

console.log(`\nImported ${inserted} shifts for week of ${weekStart}.`);
