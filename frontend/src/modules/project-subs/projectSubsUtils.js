export const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

export function formatDate(value) {
  if (!value) return '—';
  const [year, month, day] = value.slice(0, 10).split('-');
  return `${month}/${day}/${year}`;
}
