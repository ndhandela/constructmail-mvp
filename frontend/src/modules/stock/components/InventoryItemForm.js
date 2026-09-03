import React, { useState } from 'react';
import { API_BASE_URL } from '../stockUtils';

export default function InventoryItemForm({ userId, projectId, item, onSaved, onCancel }) {
  const isEdit = !!item;
  const [form, setForm] = useState({
    name: item?.name || '',
    unit: item?.unit || '',
    reorder_threshold: item?.reorder_threshold != null ? String(item.reorder_threshold) : '',
    reorder_qty: item?.reorder_qty != null ? String(item.reorder_qty) : '',
    last_known_unit_cost: item?.last_known_unit_cost != null ? String(item.last_known_unit_cost) : '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.name.trim()) { setError('Name is required.'); return; }
    const payload = {
      userId: Number(userId),
      name: form.name.trim(),
      unit: form.unit.trim() || null,
      reorder_threshold: Number(form.reorder_threshold) || 0,
      reorder_qty: Number(form.reorder_qty) || 0,
      last_known_unit_cost: Number(form.last_known_unit_cost) || 0,
    };
    setSaving(true);
    try {
      const res = isEdit
        ? await fetch(`${API_BASE_URL}/api/stock/${item.id}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
          })
        : await fetch(`${API_BASE_URL}/api/stock/projects/${projectId}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
          });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError((typeof data.detail === 'string' && data.detail) || 'Could not save the item.');
        return;
      }
      onSaved(data.item);
    } catch (err) {
      console.error('Save inventory item error:', err);
      setError('Network error. Try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="stock-modal-overlay" onClick={onCancel}>
      <form className="stock-modal" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <h3>{isEdit ? 'Edit item' : 'New inventory item'}</h3>

        <div className="stock-field">
          <label>Name</label>
          <input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. 2x4 Studs" disabled={saving} />
        </div>
        <div className="stock-form-row">
          <div className="stock-field">
            <label>Unit</label>
            <input value={form.unit} onChange={(e) => set('unit', e.target.value)} placeholder="ea, box, sheet…" disabled={saving} />
          </div>
          <div className="stock-field">
            <label>Last known unit cost</label>
            <input type="number" step="any" value={form.last_known_unit_cost} onChange={(e) => set('last_known_unit_cost', e.target.value)} disabled={saving} />
          </div>
        </div>
        <div className="stock-form-row">
          <div className="stock-field">
            <label>Reorder threshold</label>
            <input type="number" step="any" value={form.reorder_threshold} onChange={(e) => set('reorder_threshold', e.target.value)} disabled={saving} />
          </div>
          <div className="stock-field">
            <label>Reorder quantity</label>
            <input type="number" step="any" value={form.reorder_qty} onChange={(e) => set('reorder_qty', e.target.value)} disabled={saving} />
          </div>
        </div>

        {error && <div className="stock-error">{error}</div>}
        <div className="stock-form-actions">
          <button type="button" className="stock-btn-secondary" onClick={onCancel} disabled={saving}>Cancel</button>
          <button type="submit" className="stock-btn-primary" disabled={saving}>{saving ? 'Saving…' : isEdit ? 'Save changes' : 'Add item'}</button>
        </div>
      </form>
    </div>
  );
}
