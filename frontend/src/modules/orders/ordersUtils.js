export const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

export function formatCurrency(amount) {
  const value = Number(amount) || 0;
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
}

export function formatDate(isoDate) {
  if (!isoDate) return '—';
  const [year, month, day] = String(isoDate).split('T')[0].split('-');
  if (!year || !month || !day) return isoDate;
  return new Date(Number(year), Number(month) - 1, Number(day))
    .toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

// draft -> sent -> received -> closed for vendor orders; draft -> logged for
// direct purchases (see routers/orders.py / services/order_helpers.py).
export const VENDOR_FLOW = ['draft', 'sent', 'received', 'closed'];
export const DIRECT_FLOW = ['draft', 'logged'];

export const STATUS_META = {
  draft: { label: 'Draft', className: 'orders-status-draft' },
  sent: { label: 'Sent', className: 'orders-status-sent' },
  received: { label: 'Received', className: 'orders-status-received' },
  closed: { label: 'Closed', className: 'orders-status-closed' },
  logged: { label: 'Logged', className: 'orders-status-logged' },
};

export function statusMeta(status) {
  return STATUS_META[status] || { label: status || '—', className: '' };
}

export function lineTotal(li) {
  return (Number(li.qty) || 0) * (Number(li.unit_cost) || 0);
}

export function orderTotal(lineItems) {
  return (lineItems || []).reduce((sum, li) => sum + lineTotal(li), 0);
}
