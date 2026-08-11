import React, { useState, useEffect, useCallback, useImperativeHandle, forwardRef } from 'react';
import { API_BASE_URL, isProjectOwner, statusLabel } from '../capitalUtils';

const STATUS_OPTIONS = ['not_started', 'in_progress', 'complete'];

function WorkItemForm({ userId, project, workItem, onSaved, onCancel }) {
  const isEdit = !!workItem;
  const [form, setForm] = useState({
    name: workItem?.name || '',
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

// hideHeading: the standalone Work Items page (see WorkItemsApp.js) already
// shows "Work Items" as its PageHeader title, with the "+ Add work item"
// action inline in that same title row (matching Invoices/Daily
// Logs/Documents/Permits) — so this suppresses the tab's own header row
// entirely and exposes openCreateForm() via ref for PageHeader's onAction to
// call instead. The Capital Tracker dashboard embeds this tab with no
// PageHeader above it, so it keeps the default (own header + button shown).
const WorkItemsTab = forwardRef(function WorkItemsTab({ userId, user, project, hideHeading }, ref) {
  const [workItems, setWorkItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState(null);

  const canEdit = isProjectOwner(project, user);

  useImperativeHandle(ref, () => ({
    openCreateForm: () => setShowForm(true),
  }), []);

  const fetchWorkItems = useCallback(async () => {
    if (!project) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/capital/projects/${project.id}/work-items?userId=${userId}`);
      const data = await res.json();
      if (data.success) setWorkItems(data.work_items || []);
    } catch (err) {
      console.error('Fetch work items error:', err);
    } finally {
      setLoading(false);
    }
  }, [project, userId]);

  useEffect(() => { fetchWorkItems(); }, [fetchWorkItems]);

  const handleSaved = () => {
    setShowForm(false);
    setEditingItem(null);
    fetchWorkItems();
  };

  const handleDelete = async (workItem) => {
    if (!window.confirm(`Delete "${workItem.name}"? This also deletes its milestones and budget items.`)) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/capital/work-items/${workItem.id}?userId=${userId}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.success) fetchWorkItems();
    } catch (err) {
      console.error('Delete work item error:', err);
    }
  };

  return (
    <div className="capital-tab-panel">
      {!hideHeading && (
        <div className="capital-dashboard-header">
          <h2>Work Items</h2>
          {canEdit && (
            <button className="capital-btn-primary" onClick={() => setShowForm(true)}>+ Add work item</button>
          )}
        </div>
      )}

      {loading ? (
        <p className="capital-muted">Loading work items…</p>
      ) : workItems.length === 0 ? (
        <p className="capital-muted">
          {canEdit
            ? 'No work items yet. Add one to start setting up this project\'s Capital Tracker — milestones and budget items are both added under a work item.'
            : 'No work items yet. Ask your project owner to set up work items.'}
        </p>
      ) : (
        <div className="capital-table-wrapper">
          <table className="capital-table">
            <thead>
              <tr>
                <th>Name</th>
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
                      <button className="capital-link-btn capital-link-btn-danger" onClick={() => handleDelete(wi)}>Delete</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <WorkItemForm userId={userId} project={project} onSaved={handleSaved} onCancel={() => setShowForm(false)} />
      )}
      {editingItem && (
        <WorkItemForm userId={userId} project={project} workItem={editingItem} onSaved={handleSaved} onCancel={() => setEditingItem(null)} />
      )}
    </div>
  );
});

export default WorkItemsTab;
