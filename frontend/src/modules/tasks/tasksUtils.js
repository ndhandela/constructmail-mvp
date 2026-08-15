export const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

export function formatDate(isoDate) {
  if (!isoDate) return '—';
  // due_date comes back as plain YYYY-MM-DD (no time component) — parsing
  // that directly with `new Date` shifts a day in timezones behind UTC, so
  // split it out instead of going through Date() (same fix as permitsUtils).
  const [year, month, day] = isoDate.split('-');
  if (!year || !month || !day) return isoDate;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

export const STATUS_META = {
  open: { label: 'Open', className: 'tasks-status-open' },
  done: { label: 'Done', className: 'tasks-status-done' },
};

export function statusMeta(status) {
  return STATUS_META[status] || { label: status || '—', className: '' };
}
