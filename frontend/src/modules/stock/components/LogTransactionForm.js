import React, { useState } from 'react';
import { API_BASE_URL } from '../stockUtils';

const TYPES = [
  { value: 'out', label: 'Usage (out)' },
  { value: 'in', label: 'Received / starting stock (in)' },
  { value: 'adjustment', label: 'Adjustment (recount)' },
];

export default function LogTransactionForm({ userId, item, onSaved, onCancel }) {
  const [type, setType] = useState('out');
  const [qty, setQty] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const n = Number(qty);
    if (!qty || Number.isNaN(n)) { setError('Enter a quantity.'); return; }
    if (type !== 'adjustment' && n <= 0) { setError('Quantity must be greater than zero.'); return; }
    if (type === 'adjustment' && n === 0) { setError('An adjustment of zero has no effect.'); return; }

    setSaving(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/stock/${item.id}/transactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: Number(userId), type, qty: n, notes: notes.trim() || null }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError((typeof data.detail === 'string' && data.detail) || 'Could not log the transaction.');
        return;
      }
      onSaved(data);
    } catch (err) {
      console.error('Log transaction error:', err);
      setError('Network error. Try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="stock-modal-overlay" onClick={onCancel}>
      <form className="stock-modal" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <h3>Log transaction — {item.name}</h3>

        <div className="stock-field">
          <label>Type</label>
          <select value={type} onChange={(e) => setType(e.target.value)} disabled={saving}>
            {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <div className="stock-field">
          <label>Quantity {type === 'adjustment' ? '(use a negative number to reduce)' : `(${item.unit || 'units'})`}</label>
          <input type="number" step="any" value={qty} onChange={(e) => setQty(e.target.value)} disabled={saving} />
        </div>
        <div className="stock-field">
          <label>Notes</label>
          <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} disabled={saving} />
        </div>

        {error && <div className="stock-error">{error}</div>}
        <div className="stock-form-actions">
          <button type="button" className="stock-btn-secondary" onClick={onCancel} disabled={saving}>Cancel</button>
          <button type="submit" className="stock-btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Log it'}</button>
        </div>
      </form>
    </div>
  );
}
