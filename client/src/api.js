const BASE = import.meta.env.VITE_API_URL || '/api';

function getToken() {
  return localStorage.getItem('tw_token');
}

function authHeaders() {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

export const api = {
  // Auth
  login: (name, pin) => request('POST', '/auth/login', { name, pin }),
  createAccount: (name, pin) => request('POST', '/auth/create-account', { name, pin }),
  me: () => request('GET', '/auth/me'),
  allNames: () => request('GET', '/employees/all-names'),

  // Employees
  employees: () => request('GET', '/employees'),
  employee: (id) => request('GET', `/employees/${id}`),
  addEmployee: (data) => request('POST', '/employees', data),
  updateEmployee: (id, data) => request('PATCH', `/employees/${id}`, data),
  deleteEmployee: (id) => request('DELETE', `/employees/${id}`),

  // Availability
  availability: (week_start, employee_id) => {
    const q = employee_id ? `?week_start=${week_start}&employee_id=${employee_id}` : `?week_start=${week_start}`;
    return request('GET', `/availability${q}`);
  },
  confirmAvailability: (week_start, marks, is_recurring) =>
    request('POST', '/availability/confirm', { week_start, marks, is_recurring }),
  managerSetAvailability: (employee_id, week_start, marks) =>
    request('PUT', '/availability/manager', { employee_id, week_start, marks }),

  // Schedule
  schedule: (week_start) => request('GET', `/schedule?week_start=${week_start}`),
  generateSchedule: (week_start) => request('POST', `/schedule/generate?week_start=${week_start}`),
  overrideShift: (employee_id, shift_date, shift_type, custom_label) =>
    request('PUT', '/schedule/override', { employee_id, shift_date, shift_type, custom_label }),
  deleteOverride: (employee_id, shift_date) =>
    request('DELETE', '/schedule/override', { employee_id, shift_date }),
  clearSchedule: (week_start) => request('DELETE', `/schedule/clear?week_start=${week_start}`),
  publishSchedule: (week_start) => request('POST', `/schedule/publish?week_start=${week_start}`),
  unpublishSchedule: (week_start) => request('DELETE', `/schedule/publish?week_start=${week_start}`),

  availabilityStatus: (week_start) => request('GET', `/availability/status?week_start=${week_start}`),
  pendingAvailability: () => request('GET', '/availability/pending'),
  approveAvailability: (employee_id, week_start, day_of_week, manager_note) =>
    request('POST', '/availability/approve', { employee_id, week_start, day_of_week, manager_note }),
  managerSetAvailabilityDay: (employee_id, week_start, day_of_week, mark, manager_note) =>
    request('PUT', '/availability/manager', { employee_id, week_start, marks: [{ day_of_week, mark, manager_note }] }),

  // Holidays
  holidays: () => request('GET', '/holidays'),
  addHoliday: (holiday_date, name) => request('POST', '/holidays', { holiday_date, name }),
  deleteHoliday: (date) => request('DELETE', `/holidays/${date}`),
};

export function getToken2() { return getToken(); }

export function saveToken(token) { localStorage.setItem('tw_token', token); }

export function clearToken() { localStorage.removeItem('tw_token'); }

// Monday of the week containing a given date
export function weekStartOf(date) {
  const d = new Date(date + 'T12:00:00');
  const day = d.getDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

export function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

export function formatDate(dateStr) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric',
  });
}

export function currentWeekStart() {
  return weekStartOf(new Date().toISOString().slice(0, 10));
}

export const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const FULL_DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export const SHIFT_LABELS = {
  AM: '7 – 2',
  PM: '2 – Close',
  MID: '11 – 6',
  MANAGER: '8 – 4',
  TRAINING: 'Training',
  OFF: 'Off',
};
