import React, { useMemo, useState } from 'react';
import { API_BASE_URL, formatCurrency, lineTotal } from '../ordersUtils';

const BLANK_LINE = { item_description: '', qty: '', unit: '', unit_cost: '' };

// The vendor/direct toggle lives at the top of this form (the "detail view"
// per the module spec). Flipping it swaps the vendor picker for the
// free-text "purchased from" + "purchased by" + date fields, and changes the
// primary button between "Send to vendor" and "Log purchase".
export default function OrderForm({
  userId, projectId, order, prefillLines, workItems, budgetItems, vendors, members, onSaved, onCancel,
}) {
  const isEdit = !!order;
  const [orderType, setOrderType] = useState(order?.order_type || 'vendor');
  const [form, setForm] = useState({
    work_item_id: order?.work_item_id ? String(order.work_item_id) : '',
    vendor_id: order?.vendor_id ? String(order.vendor_id) : '',
    vendor_name_freetext: order?.vendor_name_freetext || '',
    purchased_by_user_id: order?.purchased_by_user_id ? String(order.purchased_by_user_id) : String(userId),
    purchase_date: order?.purchase_date ? String(order.purchase_date).split('T')[0] : '',
    budget_item_id: order?.budget_item_id ? String(order.budget_item_id) : '',
    notes: order?.notes || '',
    attachment_url: order?.attachment_url || '',
  });
  const [lines, setLines] = useState(() => {
    const src = order?.line_items?.length ? order.line_items : prefillLines;
    return src?.length
      ? src.map((li) => ({
          item_description: li.item_description || '',
          qty: String(li.qty ?? ''),
          unit: li.unit || '',
          unit_cost: String(li.unit_cost ?? ''),
        }))
      : [{ ...BLANK_LINE }];
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const total = useMemo(() => lines.reduce((s, li) => s + lineTotal(li), 0), [lines]);

  // A past-draft order keeps its lifecycle button ("Save changes"); a new /
  // still-draft one advances on save.
  const advancing = !isEdit || order.status === 'draft';
  const primaryLabel = saving
    ? 'Saving…'
    : !advancing
      ? 'Save changes'
      : orderType === 'vendor'
        ? 'Send to vendor'
        : 'Log purchase';

  const setField = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const setLine = (i, k, v) => setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, [k]: v } : l)));
  const addLine = () => setLines((ls) => [...ls, { ...BLANK_LINE }]);
  const removeLine = (i) => setLines((ls) => (ls.length === 1 ? ls : ls.filter((_, idx) => idx !== i)));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.work_item_id) { setError('Pick a work item.'); return; }
    const cleanLines = lines
      .map((l) => ({
        item_description: l.item_description.trim(),
        qty: Number(l.qty) || 0,
        unit: l.unit.trim() || null,
        unit_cost: Number(l.unit_cost) || 0,
      }))
      .filter((l) => l.item_description);
    if (cleanLines.length === 0) { setError('Add at least one line item with a description.'); return; }
    if (orderType === 'vendor' && !form.vendor_id && !isEdit) {
      // vendor_id is optional server-side, but nudge the user to pick one
      if (!window.confirm('No vendor selected. Save this vendor order without one?')) return;
    }

    const targetStatus = advancing ? (orderType === 'vendor' ? 'sent' : 'logged') : undefined;
    const payload = {
      userId: Number(userId),
      work_item_id: Number(form.work_item_id),
      order_type: orderType,
      vendor_id: orderType === 'vendor' && form.vendor_id ? Number(form.vendor_id) : null,
      vendor_name_freetext: orderType === 'direct' ? (form.vendor_name_freetext.trim() || null) : null,
      purchased_by_user_id: orderType === 'direct' && form.purchased_by_user_id ? Number(form.purchased_by_user_id) : null,
      purchase_date: form.purchase_date || null,
      budget_item_id: form.budget_item_id ? Number(form.budget_item_id) : null,
      notes: form.notes.trim() || null,
      attachment_url: form.attachment_url.trim() || null,
      line_items: cleanLines,
      ...(targetStatus ? { status: targetStatus } : {}),
    };

    setSaving(true);
    try {
      const res = isEdit
        ? await fetch(`${API_BASE_URL}/api/orders/${order.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
        : await fetch(`${API_BASE_URL}/api/orders/projects/${projectId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError((typeof data.detail === 'string' && data.detail) || 'Could not save the order.');
        return;
      }
      onSaved(data.order);
    } catch (err) {
      console.error('Save order error:', err);
      setError('Network error. Try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="orders-modal-overlay" onClick={onCancel}>
      <form className="orders-modal" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <h3>{isEdit ? `Edit order #${order.id}` : 'New order'}</h3>

        <div className="orders-type-toggle">
          <button
            type="button"
            className={orderType === 'vendor' ? 'active' : ''}
            onClick={() => setOrderType('vendor')}
            aria-pressed={orderType === 'vendor'}
          >
            Vendor order
          </button>
          <button
            type="button"
            className={orderType === 'direct' ? 'active' : ''}
            onClick={() => setOrderType('direct')}
            aria-pressed={orderType === 'direct'}
          >
            Direct purchase
          </button>
        </div>

        <div className="orders-field">
          <label>Work item</label>
          <select value={form.work_item_id} onChange={(e) => setField('work_item_id', e.target.value)} disabled={saving}>
            <option value="">Select a work item…</option>
            {workItems.map((wi) => (
              <option key={wi.id} value={wi.id}>{wi.name}</option>
            ))}
          </select>
        </div>

        {orderType === 'vendor' ? (
          <div className="orders-field">
            <label>Vendor</label>
            <select value={form.vendor_id} onChange={(e) => setField('vendor_id', e.target.value)} disabled={saving}>
              <option value="">Select a vendor…</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>{v.trade ? `${v.name} — ${v.trade}` : v.name}</option>
              ))}
            </select>
          </div>
        ) : (
          <div className="orders-form-row">
            <div className="orders-field">
              <label>Purchased from</label>
              <input
                value={form.vendor_name_freetext}
                onChange={(e) => setField('vendor_name_freetext', e.target.value)}
                placeholder="e.g. Corner Hardware"
                disabled={saving}
              />
            </div>
            <div className="orders-field">
              <label>Purchased by</label>
              <select value={form.purchased_by_user_id} onChange={(e) => setField('purchased_by_user_id', e.target.value)} disabled={saving}>
                <option value="">—</option>
                {members.map((m) => (
                  <option key={m.user_id} value={m.user_id}>{m.full_name || m.name || m.email}</option>
                ))}
              </select>
            </div>
          </div>
        )}

        <div className="orders-form-row">
          <div className="orders-field">
            <label>{orderType === 'direct' ? 'Purchase date' : 'Expected / purchase date'}</label>
            <input type="date" value={form.purchase_date} onChange={(e) => setField('purchase_date', e.target.value)} disabled={saving} />
          </div>
          <div className="orders-field">
            <label>Link to budget line (optional)</label>
            <select value={form.budget_item_id} onChange={(e) => setField('budget_item_id', e.target.value)} disabled={saving}>
              <option value="">Not linked</option>
              {budgetItems.map((bi) => (
                <option key={bi.id} value={bi.id}>{bi.label}</option>
              ))}
            </select>
          </div>
        </div>

        <label className="orders-field" style={{ marginBottom: 6 }}><span style={{ fontSize: 12, fontWeight: 600, color: 'var(--slate)' }}>Line items</span></label>
        <div className="orders-line-editor">
          {lines.map((li, i) => (
            <div className="orders-line-editor-row" key={i}>
              <input
                placeholder="Description"
                value={li.item_description}
                onChange={(e) => setLine(i, 'item_description', e.target.value)}
                disabled={saving}
              />
              <input placeholder="Qty" type="number" step="any" value={li.qty} onChange={(e) => setLine(i, 'qty', e.target.value)} disabled={saving} />
              <input placeholder="Unit" value={li.unit} onChange={(e) => setLine(i, 'unit', e.target.value)} disabled={saving} />
              <input placeholder="Unit cost" type="number" step="any" value={li.unit_cost} onChange={(e) => setLine(i, 'unit_cost', e.target.value)} disabled={saving} />
              <button type="button" className="orders-line-remove" onClick={() => removeLine(i)} title="Remove line" disabled={saving}>×</button>
            </div>
          ))}
          <button type="button" className="orders-line-add" onClick={addLine} disabled={saving}>+ Add line</button>
          <div className="orders-line-editor-total">Order total: {formatCurrency(total)}</div>
        </div>

        <div className="orders-field">
          <label>Notes</label>
          <textarea rows={2} value={form.notes} onChange={(e) => setField('notes', e.target.value)} disabled={saving} />
        </div>

        <div className="orders-field">
          <label>Attachment link (optional)</label>
          <input value={form.attachment_url} onChange={(e) => setField('attachment_url', e.target.value)} placeholder="https://…" disabled={saving} />
        </div>

        {error && <div className="orders-error">{error}</div>}

        <div className="orders-form-actions">
          <button type="button" className="orders-btn-secondary" onClick={onCancel} disabled={saving}>Cancel</button>
          <button type="submit" className="orders-btn-primary" disabled={saving}>{primaryLabel}</button>
        </div>
      </form>
    </div>
  );
}
