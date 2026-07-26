import React, { useState, useEffect, useCallback } from 'react';
import { API_BASE_URL } from '../invoicesUtils';

// Work item -> budget item cascading picker, scoped to the project already
// chosen in the header (Capital Tracker/Daily Logs pattern — see
// InvoiceTrackerApp.js). Both are optional (a general project-level invoice
// can leave either unset). Fetches from routers/invoices.py's own picker
// endpoints (not routers/capital.py's), which are gated by 'invoice_tracker'
// alone so this works even when Capital Tracker itself is off for the
// company. `projectId` is fixed for the life of this form — it comes from
// the header switcher for a new invoice, or the invoice's own project_id
// when editing (never user-editable, so there's no picker for it here).
export default function InvoiceUploadForm({ userId, projectId, invoice, onSaved, onCancel }) {
  const isEdit = !!invoice;
  const [workItems, setWorkItems] = useState([]);
  const [budgetItems, setBudgetItems] = useState([]);
  const [form, setForm] = useState({
    vendor_name: invoice?.vendor_name || '',
    invoice_number: invoice?.invoice_number || '',
    amount: invoice?.amount ?? '',
    invoice_date: invoice?.invoice_date || '',
    due_date: invoice?.due_date || '',
    status: invoice?.status || 'pending',
    notes: invoice?.notes || '',
    work_item_id: invoice?.work_item_id ? String(invoice.work_item_id) : '',
    budget_item_id: invoice?.budget_item_id ? String(invoice.budget_item_id) : '',
  });
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const fetchWorkItems = useCallback(async () => {
    if (!projectId) {
      setWorkItems([]);
      return;
    }
    try {
      const res = await fetch(`${API_BASE_URL}/api/invoices/projects/${projectId}/work-items?userId=${userId}`);
      const data = await res.json();
      if (data.success) setWorkItems(data.work_items || []);
    } catch (err) {
      console.error('Fetch work items error:', err);
    }
  }, [projectId, userId]);

  useEffect(() => { fetchWorkItems(); }, [fetchWorkItems]);

  const fetchBudgetItems = useCallback(async () => {
    if (!projectId || !form.work_item_id) {
      setBudgetItems([]);
      return;
    }
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/invoices/projects/${projectId}/budget-items?userId=${userId}&work_item_id=${form.work_item_id}`,
      );
      const data = await res.json();
      if (data.success) setBudgetItems(data.budget_items || []);
    } catch (err) {
      console.error('Fetch budget items error:', err);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, form.work_item_id, userId]);

  useEffect(() => { fetchBudgetItems(); }, [fetchBudgetItems]);

  const handleWorkItemChange = (value) => {
    setForm((f) => ({ ...f, work_item_id: value, budget_item_id: '' }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!projectId) { setError('No project selected. Choose one from the header first.'); return; }
    if (!form.vendor_name.trim()) { setError('Vendor name is required.'); return; }
    if (!form.amount || Number(form.amount) <= 0) { setError('Enter an amount greater than 0.'); return; }
    if (!isEdit && !file) { setError('Attach a PDF invoice.'); return; }

    setSaving(true);
    setError('');
    try {
      let res;
      if (isEdit) {
        res = await fetch(`${API_BASE_URL}/api/invoices/${invoice.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: Number(userId),
            vendor_name: form.vendor_name.trim(),
            invoice_number: form.invoice_number.trim() || null,
            amount: Number(form.amount),
            invoice_date: form.invoice_date || null,
            due_date: form.due_date || null,
            status: form.status,
            notes: form.notes.trim() || null,
            work_item_id: form.work_item_id ? Number(form.work_item_id) : null,
            budget_item_id: form.budget_item_id ? Number(form.budget_item_id) : null,
          }),
        });
      } else {
        const body = new FormData();
        body.append('userId', userId);
        body.append('vendor_name', form.vendor_name.trim());
        if (form.invoice_number.trim()) body.append('invoice_number', form.invoice_number.trim());
        body.append('amount', form.amount);
        if (form.invoice_date) body.append('invoice_date', form.invoice_date);
        if (form.due_date) body.append('due_date', form.due_date);
        body.append('status', form.status);
        if (form.notes.trim()) body.append('notes', form.notes.trim());
        if (form.work_item_id) body.append('work_item_id', form.work_item_id);
        if (form.budget_item_id) body.append('budget_item_id', form.budget_item_id);
        body.append('file', file);
        res = await fetch(`${API_BASE_URL}/api/invoices/projects/${projectId}`, { method: 'POST', body });
      }
      const data = await res.json();
      if (!res.ok) {
        setError(data.detail || 'Could not save invoice.');
        return;
      }
      onSaved();
    } catch (err) {
      console.error('Save invoice error:', err);
      setError('Network error. Try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="invoices-modal-overlay" onClick={onCancel}>
      <form className="invoices-modal" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <h3>{isEdit ? 'Edit invoice' : 'Upload invoice'}</h3>

        <div className="invoices-form-row">
          <div className="invoices-field">
            <label>Work Item (optional)</label>
            <select
              value={form.work_item_id}
              onChange={(e) => handleWorkItemChange(e.target.value)}
              disabled={saving || !projectId || workItems.length === 0}
            >
              <option value="">— None —</option>
              {workItems.map((wi) => (
                <option key={wi.id} value={wi.id}>{wi.name}</option>
              ))}
            </select>
          </div>
          <div className="invoices-field">
            <label>Budget Item (optional)</label>
            <select
              value={form.budget_item_id}
              onChange={(e) => setForm((f) => ({ ...f, budget_item_id: e.target.value }))}
              disabled={saving || !form.work_item_id || budgetItems.length === 0}
            >
              <option value="">— None —</option>
              {budgetItems.map((bi) => (
                <option key={bi.id} value={bi.id}>{bi.category_name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="invoices-form-row">
          <div className="invoices-field">
            <label>Vendor Name</label>
            <input
              value={form.vendor_name}
              onChange={(e) => setForm((f) => ({ ...f, vendor_name: e.target.value }))}
              required
              disabled={saving}
            />
          </div>
          <div className="invoices-field">
            <label>Invoice Number</label>
            <input
              value={form.invoice_number}
              onChange={(e) => setForm((f) => ({ ...f, invoice_number: e.target.value }))}
              disabled={saving}
            />
          </div>
        </div>

        <div className="invoices-form-row">
          <div className="invoices-field">
            <label>Amount</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={form.amount}
              onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
              required
              disabled={saving}
            />
          </div>
          <div className="invoices-field">
            <label>Status</label>
            <select
              value={form.status}
              onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
              disabled={saving}
            >
              <option value="pending">Pending</option>
              <option value="paid">Paid</option>
            </select>
          </div>
        </div>

        <div className="invoices-form-row">
          <div className="invoices-field">
            <label>Invoice Date</label>
            <input
              type="date"
              value={form.invoice_date}
              onChange={(e) => setForm((f) => ({ ...f, invoice_date: e.target.value }))}
              disabled={saving}
            />
          </div>
          <div className="invoices-field">
            <label>Due Date</label>
            <input
              type="date"
              value={form.due_date}
              onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))}
              disabled={saving}
            />
          </div>
        </div>

        {!isEdit && (
          <div className="invoices-field">
            <label>Invoice PDF</label>
            <input
              type="file"
              accept="application/pdf"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              required
              disabled={saving}
            />
          </div>
        )}

        <div className="invoices-field">
          <label>Notes</label>
          <textarea
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            rows={3}
            disabled={saving}
          />
        </div>

        {error && <div className="invoices-error">{error}</div>}
        <div className="invoices-form-actions">
          <button type="button" className="invoices-btn-secondary" onClick={onCancel} disabled={saving}>Cancel</button>
          <button type="submit" className="invoices-btn-primary" disabled={saving}>
            {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Upload invoice'}
          </button>
        </div>
      </form>
    </div>
  );
}
