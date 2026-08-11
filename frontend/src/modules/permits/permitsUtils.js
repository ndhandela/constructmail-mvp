export const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

export function formatDate(isoDate) {
  if (!isoDate) return '—';
  // expiration_date/issue_date come back as plain YYYY-MM-DD (no time
  // component) — parsing that directly with `new Date` shifts a day in
  // timezones behind UTC, so split it out instead of going through Date().
  const [year, month, day] = isoDate.split('-');
  if (!year || !month || !day) return isoDate;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

export const STATUS_META = {
  active: { label: 'Active', className: 'permits-status-active' },
  expiring_soon: { label: 'Expiring Soon', className: 'permits-status-expiring-soon' },
  expired: { label: 'Expired', className: 'permits-status-expired' },
};

export function statusMeta(status) {
  return STATUS_META[status] || { label: status || '—', className: '' };
}
