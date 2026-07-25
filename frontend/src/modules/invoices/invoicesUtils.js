export const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

export function formatCurrency(amount) {
  const value = Number(amount) || 0;
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

export function statusLabel(status) {
  return (status || '').split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}
