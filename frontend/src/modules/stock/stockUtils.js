export const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

export function formatCurrency(amount) {
  const value = Number(amount) || 0;
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
}

export function formatQty(qty) {
  const n = Number(qty) || 0;
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

export function formatDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

// red / amber / green — mirrors services/stock_helpers.stock_status so the
// dot and the server agree. red = out (<= 0), amber = below reorder
// threshold, green = at or above.
export const STATUS_DOT = {
  red: { className: 'stock-dot-red', label: 'Out of stock' },
  amber: { className: 'stock-dot-amber', label: 'Below reorder point' },
  green: { className: 'stock-dot-green', label: 'In stock' },
};

export function statusDot(status) {
  return STATUS_DOT[status] || STATUS_DOT.green;
}

export const TXN_META = {
  in: { label: 'In', className: 'stock-txn-in', sign: '+' },
  out: { label: 'Out', className: 'stock-txn-out', sign: '−' },
  adjustment: { label: 'Adjustment', className: 'stock-txn-adj', sign: '' },
};

export function txnMeta(type) {
  return TXN_META[type] || { label: type, className: '', sign: '' };
}
