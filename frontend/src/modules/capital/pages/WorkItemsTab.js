import React, { useState, useEffect, useCallback } from 'react';
import { API_BASE_URL, isProjectOwner, statusLabel } from '../capitalUtils';

const STATUS_OPTIONS = ['not_started', 'in_progress', 'complete'];

function WorkItemForm({ userId, project, workItem, budgetItems, milestones, onSaved, onCancel }) {
  const isEdit = !!workItem;
  const [form, setForm] = useState({
    name: workItem?.name || '',
    budget_item_id: workItem?.budget_item_id ?? '',
    milestone_id: workItem?.milestone_id ?? '',
    status: workItem?.status || 'not_started',
    percent_complete: workItem?.percent_complete ?? 0,
    due_date: workItem?.due_date ? workItem.due_date.slice(0, 10) : '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const url = isEdit
        ? `${API_BASE_URL}/api/capital/work-items/${workItem.id}`
        : `${API_BASE_URL}/api/capital/projects/${project.id}/work-items`;
      const body = {
        userId: Number(userId),
        name: form.name.trim(),
        budget_item_id: form.budget_item_id ? Number(form.budget_item_id) : null,
        milestone_id: form.milestone_id ? Number(form.milestone_id) : null,
        status: form.status,
        percent_complete: Number(form.percent_complete) || 0,
        due_date: form.due_date || null,
      };
      const res = await fetch(url, {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.detail || 'Could not save work item.');
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
        <h3>{isEdit ? `Edit ${workItem.name}` : 'New work item'}</h3>

        <div className="capital-field">
          <label>Name</label>
          <input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="e.g. Pour footings"
            required
            disabled={saving}
          />
        </div>

        <div className="capital-form-row">
          <div className="capital-field">
            <label>Budget Category</label>
            <select
              value={form.budget_item_id}
              onChange={(e) => setForm((f) => ({ ...f, budget_item_id: e.target.value }))}
              disabled={saving}
            >
              <option value="">— None —</option>
              {budgetItems.map((bi) => (
                <option key={bi.id} value={bi.id}>{bi.category}</option>
              ))}
            </select>
          </div>
          <div className="capital-field">
            <label>Milestone</label>
            <select
              value={form.milestone_id}
              onChange={(e) => setForm((f) => ({ ...f, milestone_id: e.target.value }))}
              disabled={saving}
            >
              <option value="">— None —</option>
              {milestones.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="capital-form-row">
          <div className="capital-field">
            <label>Status</label>
            <select
              value={form.status}
              onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
              disabled={saving}
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>{statusLabel(s)}</option>
              ))}
            </select>
          </div>
          <div className="capital-field">
            <label>Percent Complete</label>
            <input
              type="number"
              step="1"
              min="0"
              max="100"
              value={form.percent_complete}
              onChange={(e) => setForm((f) => ({ ...f, percent_complete: e.target.value }))}
              disabled={saving}
            />
          </div>
        </div>

        <div className="capital-field">
          <label>Due Date</label>
          <input
            type="date"
            value={form.due_date}
            onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))}
            disabled={saving}
          />
        </div>

        {error && <div className="capital-error">{error}</div>}
        <div className="capital-form-actions">
          <button type="button" className="capital-btn-secondary" onClick={onCancel} disabled={saving}>Cancel</button>
          <button type="submit" className="capital-btn-primary" disabled={saving}>
            {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Add work item'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function WorkItemsTab({ userId, user, project }) {
  const [workItems, setWorkItems] = useState([]);
  const [budgetItems, setBudgetItems] = useState([]);
  const [milestones, setMilestones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState(null);

  const canEdit = isProjectOwner(project, user);

  const fetchAll = useCallback(async () => {
    if (!project) return;
    setLoading(true);
    try {
      const [wiRes, biRes, msRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/capital/projects/${project.id}/work-items?userId=${userId}`),
        fetch(`${API_BASE_URL}/api/capital/projects/${project.id}/items?userId=${userId}`),
        fetch(`${API_BASE_URL}/api/capital/projects/${project.id}/milestones?userId=${userId}`),
      ]);
      const [wiData, biData, msData] = await Promise.all([wiRes.json(), biRes.json(), msRes.json()]);
      if (wiData.success) setWorkItems(wiData.work_items || []);
      if (biData.success) setBudgetItems(biData.items || []);
      if (msData.success) setMilestones(msData.milestones || []);
    } catch (err) {
      console.error('Fetch work items error:', err);
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

  const categoryName = (id) => budgetItems.find((bi) => bi.id === id)?.category || '—';
  const milestoneName = (id) => milestones.find((m) => m.id === id)?.name || '—';

  return (
    <div className="capital-tab-panel">
      <div className="capital-dashboard-header">
        <h2>Work Items</h2>
        {canEdit && (
          <button className="capital-btn-primary" onClick={() => setShowForm(true)}>+ Add work item</button>
        )}
      </div>

      {loading ? (
        <p className="capital-muted">Loading work items…</p>
      ) : workItems.length === 0 ? (
        <p className="capital-muted">
          No work items yet. {canEdit ? 'Add one to start tracking progress.' : 'Ask your project owner to set up work items.'}
        </p>
      ) : (
        <div className="capital-table-wrapper">
          <table className="capital-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Budget Category</th>
                <th>Milestone</th>
                <th>Status</th>
                <th>% Complete</th>
                <th>Due Date</th>
                {canEdit && <th></th>}
              </tr>
            </thead>
            <tbody>
              {workItems.map((wi) => (
                <tr key={wi.id}>
                  <td>{wi.name}</td>
                  <td>{categoryName(wi.budget_item_id)}</td>
                  <td>{milestoneName(wi.milestone_id)}</td>
                  <td>
                    <span className={`capital-status-pill capital-status-${wi.status}`}>
                      {statusLabel(wi.status)}
                    </span>
                  </td>
                  <td>{Number(wi.percent_complete)}%</td>
                  <td>{wi.due_date ? wi.due_date.slice(0, 10) : '—'}</td>
                  {canEdit && (
                    <td>
                      <button className="capital-link-btn" onClick={() => setEditingItem(wi)}>Edit</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <WorkItemForm userId={userId} project={project} budgetItems={budgetItems} milestones={milestones} onSaved={handleSaved} onCancel={() => setShowForm(false)} />
      )}
      {editingItem && (
        <WorkItemForm userId={userId} project={project} workItem={editingItem} budgetItems={budgetItems} milestones={milestones} onSaved={handleSaved} onCancel={() => setEditingItem(null)} />
      )}
    </div>
  );
}
