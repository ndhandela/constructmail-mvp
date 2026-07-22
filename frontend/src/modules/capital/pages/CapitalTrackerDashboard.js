import React, { useState, useEffect, useCallback } from 'react';
import { API_BASE_URL, isProjectOwner, formatCurrency, varianceColor, varianceBg, progressColor } from '../capitalUtils';
import MilestonesTab from './MilestonesTab';
import WorkItemsTab from './WorkItemsTab';

const TABS = [
  { key: 'budget', label: 'Budget' },
  { key: 'milestones', label: 'Milestones' },
  { key: 'workitems', label: 'Work Items' },
];

function BudgetItemForm({ userId, project, item, onSaved, onCancel }) {
  const isEdit = !!item;
  const [form, setForm] = useState({
    category: item?.category || '',
    budgeted_amount: item?.budgeted_amount ?? '',
    committed_amount: item?.committed_amount ?? 0,
    actual_spent: item?.actual_spent ?? 0,
    notes: item?.notes || '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const url = isEdit
        ? `${API_BASE_URL}/api/capital/items/${item.id}`
        : `${API_BASE_URL}/api/capital/projects/${project.id}/items`;
      const body = isEdit
        ? {
            userId: Number(userId),
            committed_amount: Number(form.committed_amount) || 0,
            actual_spent: Number(form.actual_spent) || 0,
            notes: form.notes.trim() || null,
          }
        : {
            userId: Number(userId),
            category: form.category.trim(),
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
        <h3>{isEdit ? `Edit ${item.category}` : 'New budget category'}</h3>

        {!isEdit && (
          <div className="capital-field">
            <label>Category</label>
            <input
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              placeholder="e.g. Site work, Framing, Electrical"
              required
              disabled={saving}
            />
          </div>
        )}

        {!isEdit && (
          <div className="capital-field">
            <label>Budgeted Amount</label>
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
            <label>Actual Spent</label>
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
            {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Add category'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function CapitalTrackerDashboard({ userId, user, project }) {
  const [activeTab, setActiveTab] = useState('budget');
  const [items, setItems] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState(null);

  const canEdit = isProjectOwner(project, user);

  const fetchItems = useCallback(async () => {
    if (!project) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/capital/projects/${project.id}/items?userId=${userId}`);
      const data = await res.json();
      if (data.success) {
        setItems(data.items || []);
        setSummary(data.budget_summary || null);
      }
    } catch (err) {
      console.error('Fetch budget items error:', err);
    } finally {
      setLoading(false);
    }
  }, [project, userId]);

  useEffect(() => {
    if (activeTab === 'budget') fetchItems();
  }, [fetchItems, activeTab]);

  const handleSaved = () => {
    setShowForm(false);
    setEditingItem(null);
    fetchItems();
  };

  if (!project) return null;

  return (
    <div className="capital-dashboard">
      <div className="capital-tabs">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            className={`capital-tab${activeTab === tab.key ? ' capital-tab-active' : ''}`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'milestones' && <MilestonesTab userId={userId} user={user} project={project} />}
      {activeTab === 'workitems' && <WorkItemsTab userId={userId} user={user} project={project} />}

      {activeTab === 'budget' && (
        <>
          <div className="capital-dashboard-header">
            <h2>Budget Categories</h2>
            {canEdit && (
              <button className="capital-btn-primary" onClick={() => setShowForm(true)}>+ Add category</button>
            )}
          </div>

          {loading ? (
            <p className="capital-muted">Loading budget…</p>
          ) : (
            <>
              <div className="capital-summary-cards">
                <div className="capital-summary-card">
                  <span className="capital-summary-label">Total Budgeted</span>
                  <span className="capital-summary-value">{formatCurrency(summary?.total_budgeted)}</span>
                </div>
                <div className="capital-summary-card">
                  <span className="capital-summary-label">Total Committed</span>
                  <span className="capital-summary-value">{formatCurrency(summary?.total_committed)}</span>
                </div>
                <div className="capital-summary-card">
                  <span className="capital-summary-label">Total Actual</span>
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

              {items.length === 0 ? (
                <p className="capital-muted">
                  No budget categories yet. {canEdit ? 'Add one to get started.' : 'Ask your project owner to set up the budget.'}
                </p>
              ) : (
                <div className="capital-table-wrapper">
                  <table className="capital-table">
                    <thead>
                      <tr>
                        <th>Category</th>
                        <th>Budgeted</th>
                        <th>Committed</th>
                        <th>Actual</th>
                        <th>Variance</th>
                        <th>Progress</th>
                        {canEdit && <th></th>}
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item) => {
                        const variance = Number(item.budgeted_amount) - Number(item.actual_spent);
                        return (
                          <tr key={item.id}>
                            <td>{item.category}</td>
                            <td>{formatCurrency(item.budgeted_amount)}</td>
                            <td>{formatCurrency(item.committed_amount)}</td>
                            <td>{formatCurrency(item.actual_spent)}</td>
                            <td style={{ color: varianceColor(variance), fontWeight: 600 }}>
                              {formatCurrency(variance)}
                            </td>
                            <td style={{ color: progressColor(item.percent_complete, item.spend_percent), fontWeight: 600 }}>
                              {item.work_item_count > 0
                                ? `${item.percent_complete}% done · ${item.spend_percent ?? 0}% spent`
                                : '—'}
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
        </>
      )}

      {showForm && (
        <BudgetItemForm userId={userId} project={project} onSaved={handleSaved} onCancel={() => setShowForm(false)} />
      )}
      {editingItem && (
        <BudgetItemForm userId={userId} project={project} item={editingItem} onSaved={handleSaved} onCancel={() => setEditingItem(null)} />
      )}
    </div>
  );
}
