export const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

export const WEATHER_OPTIONS = ['Clear', 'Cloudy', 'Rain', 'Snow', 'Wind', 'Extreme heat', 'Extreme cold'];

export const DELAY_CATEGORIES = ['weather', 'material', 'labor', 'other'];

const EDIT_WINDOW_MS = 48 * 60 * 60 * 1000;

// Mirrors routers/daily_logs.py's _require_can_edit_log: a company owner can
// always edit, otherwise only the logging user, and only within 48 hours of
// log_date — a field log is one person's on-the-day record, not a shared
// spreadsheet row like Capital Tracker's budget items.
export function canEditLog(log, user, userId) {
  if (!log || !user) return false;
  if (user.permission_level === 'owner') return true;
  if (Number(log.logged_by_user_id) !== Number(userId)) return false;
  const logDate = new Date(`${log.log_date}T00:00:00`);
  return Date.now() - logDate.getTime() <= EDIT_WINDOW_MS;
}

export function formatDate(value) {
  if (!value) return '—';
  const [year, month, day] = value.slice(0, 10).split('-');
  return `${month}/${day}/${year}`;
}

export function delayCategoryLabel(category) {
  if (!category) return '—';
  return category.charAt(0).toUpperCase() + category.slice(1);
}

export function workSummary(text, maxLength = 120) {
  if (!text) return '—';
  return text.length > maxLength ? `${text.slice(0, maxLength).trim()}…` : text;
}
