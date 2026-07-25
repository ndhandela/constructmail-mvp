import React, { useState, useEffect, useCallback } from 'react';
import { API_BASE_URL, isProjectOwner, formatCurrency, varianceColor, varianceBg } from '../capitalUtils';
import CategoryPicker from '../components/CategoryPicker';

function BudgetItemForm({ userId, project, item, workItems, onSaved, onCancel }) {
  const isEdit = !!item;
  const [form, setForm] = useState({
    work_item_id: item?.work_item_id ?? '',
    category_id: item?.category_id ?? '',
    budgeted_amount: item?.budgeted_amount ?? '',
    committed_amount: item?.committed_amount ?? 0,
    actual_spent: item?.actual_spent ?? 0,
    notes: item?.notes || '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.work_item_id) {
      setError('Select a work item.');
      return;
    }
    if (!form.category_id) {
      setError('Select or create a category.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const url = isEdit
        ? `${API_BASE_URL}/api/capital/items/${item.id}`
        : `${API_BASE_URL}/api/capital/projects/${project.id}/items`;
      const body = isEdit
        ? {
            userId: Number(userId),
            work_item_id: Number(form.work_item_id),
            category_id: Number(form.category_id),
            committed_amount: Number(form.committed_amount) || 0,
            actual_spent: Number(form.actual_spent) || 0,
            notes: form.notes.trim() || null,
          }
        : {
            userId: Number(userId),
            work_item_id: Number(form.work_item_id),
            category_id: Number(form.category_id),
            budgeted_amount: Number(form.budgeted_amount) || 0,
            committed_amount: Number(form.committed_amount) || 0,
            actual_spent: Number(form.actual_spent) || 0,
            notes: form.notes.trim() || null,
          };
      const res = await fetch(url, {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.detail || 'Could not save budget item.');
        return;
      }
      onSaved();
    } catch (err) {
      setError('Network error. Try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="capital-modal-overlay" onClick={onCancel}>
      <form className="capital-modal" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <h3>{isEdit ? 'Edit budget item' : 'New budget item'}</h3>

        <div className="capital-field">
          <label>Work Item</label>
          <select
            value={form.work_item_id}
            onChange={(e) => setForm((f) => ({ ...f, work_item_id: e.target.value }))}
            required
            disabled={saving}
          >
            <option value="">— Select a work item —</option>
            {workItems.map((wi) => (
              <option key={wi.id} value={wi.id}>{wi.name}</option>
            ))}
          </select>
        </div>

        <div className="capital-field">
          <label>Category</label>
          <CategoryPicker
            userId={userId}
            project={project}
            value={form.category_id}
            onChange={(categoryId) => setForm((f) => ({ ...f, category_id: categoryId }))}
            disabled={saving}
          />
        </div>

        {!isEdit && (
          <div className="capital-field">
            <label>Allotted Amount</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={form.budgeted_amount}
              onChange={(e) => setForm((f) => ({ ...f, budgeted_amount: e.target.value }))}
              required
              disabled={saving}
            />
          </div>
        )}

        <div className="capital-form-row">
          <div className="capital-field">
            <label>Committed Amount</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={form.committed_amount}
              onChange={(e) => setForm((f) => ({ ...f, committed_amount: e.target.value }))}
              disabled={saving}
            />
          </div>
          <div className="capital-field">
            <label>Spent Amount</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={form.actual_spent}
              onChange={(e) => setForm((f) => ({ ...f, actual_spent: e.target.value }))}
              disabled={saving}
            />
          </div>
        </div>

        <div className="capital-field">
          <label>Notes</label>
          <textarea
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            rows={3}
            disabled={saving}
          />
        </div>

        {error && <div className="capital-error">{error}</div>}
        <div className="capital-form-actions">
          <button type="button" className="capital-btn-secondary" onClick={onCancel} disabled={saving}>Cancel</button>
          <button type="submit" className="capital-btn-primary" disabled={saving}>
            {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Add budget item'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function BudgetItemsTab({ userId, user, project }) {
  const [items, setItems] = useState([]);
  const [workItems, setWorkItems] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState(null);

  const canEdit = isProjectOwner(project, user);

  const fetchAll = useCallback(async () => {
    if (!project) return;
    setLoading(true);
    try {
      const [itemsRes, wiRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/capital/projects/${project.id}/items?userId=${userId}`),
        fetch(`${API_BASE_URL}/api/capital/projects/${project.id}/work-items?userId=${userId}`),
      ]);
      const [itemsData, wiData] = await Promise.all([itemsRes.json(), wiRes.json()]);
      if (itemsData.success) {
        setItems(itemsData.items || []);
        setSummary(itemsData.budget_summary || null);
      }
      if (wiData.success) setWorkItems(wiData.work_items || []);
    } catch (err) {
      console.error('Fetch budget items error:', err);
    } finally {
      setLoading(false);
    }
  }, [project, userId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleSaved = () => {
    setShowForm(false);
    setEditingItem(null);
    fetchAll();
  };

  if (!project) return null;

  const noWorkItems = !loading && workItems.length === 0;

  return (
    <div className="capital-tab-panel">
      <div className="capital-dashboard-header">
        <h2>Budget Items</h2>
        {canEdit && (
          <button
            className="capital-btn-primary"
            onClick={() => setShowForm(true)}
            disabled={noWorkItems}
            title={noWorkItems ? 'Add a work item first' : undefined}
          >
            + Add budget item
          </button>
        )}
      </div>

      {loading ? (
        <p className="capital-muted">Loading budget…</p>
      ) : (
        <>
          <div className="capital-summary-cards">
            <div className="capital-summary-card">
              <span className="capital-summary-label">Total Allotted</span>
              <span className="capital-summary-value">{formatCurrency(summary?.total_budgeted)}</span>
            </div>
            <div className="capital-summary-card">
              <span className="capital-summary-label">Total Committed</span>
              <span className="capital-summary-value">{formatCurrency(summary?.total_committed)}</span>
            </div>
            <div className="capital-summary-card">
              <span className="capital-summary-label">Total Spent</span>
              <span className="capital-summary-value">{formatCurrency(summary?.total_actual)}</span>
            </div>
            <div
              className="capital-summary-card capital-summary-card-variance"
              style={{ color: varianceColor(summary?.variance ?? 0), background: varianceBg(summary?.variance ?? 0) }}
            >
              <span className="capital-summary-label">Variance</span>
              <span className="capital-summary-value">{formatCurrency(summary?.variance)}</span>
            </div>
          </div>

          {noWorkItems ? (
            <p className="capital-muted">
              No work items yet. {canEdit ? 'Add a work item first, then add budget items under it.' : 'Ask your project owner to set up work items.'}
            </p>
          ) : items.length === 0 ? (
            <p className="capital-muted">
              No budget items yet. {canEdit ? 'Add one to get started.' : 'Ask your project owner to set up the budget.'}
            </p>
          ) : (
            <div className="capital-table-wrapper">
              <table className="capital-table">
                <thead>
                  <tr>
                    <th>Work Item</th>
                    <th>Category</th>
                    <th>Allotted</th>
                    <th>Committed</th>
                    <th>Spent</th>
                    <th>Variance</th>
                    {canEdit && <th></th>}
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => {
                    const variance = Number(item.budgeted_amount) - Number(item.actual_spent);
                    return (
                      <tr key={item.id}>
                        <td>{item.work_item_name}</td>
                        <td>{item.category_name}</td>
                        <td>{formatCurrency(item.budgeted_amount)}</td>
                        <td>{formatCurrency(item.committed_amount)}</td>
                        <td>{formatCurrency(item.actual_spent)}</td>
                        <td style={{ color: varianceColor(variance), fontWeight: 600 }}>
                          {formatCurrency(variance)}
                        </td>
                        {canEdit && (
                          <td>
                            <button className="capital-link-btn" onClick={() => setEditingItem(item)}>Edit</button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {showForm && (
        <BudgetItemForm userId={userId} project={project} workItems={workItems} onSaved={handleSaved} onCancel={() => setShowForm(false)} />
      )}
      {editingItem && (
        <BudgetItemForm userId={userId} project={project} item={editingItem} workItems={workItems} onSaved={handleSaved} onCancel={() => setEditingItem(null)} />
      )}
    </div>
  );
}
