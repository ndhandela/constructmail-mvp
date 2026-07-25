import React, { useState, useEffect, useCallback } from 'react';
import { API_BASE_URL, isProjectOwner, statusLabel } from '../capitalUtils';

const STATUS_OPTIONS = ['not_started', 'in_progress', 'at_risk', 'complete'];

function MilestoneForm({ userId, project, milestone, workItems, onSaved, onCancel }) {
  const isEdit = !!milestone;
  const [form, setForm] = useState({
    work_item_id: milestone?.work_item_id ?? '',
    name: milestone?.name || '',
    target_date: milestone?.target_date ? milestone.target_date.slice(0, 10) : '',
    actual_date: milestone?.actual_date ? milestone.actual_date.slice(0, 10) : '',
    status: milestone?.status || 'not_started',
    risk_flag: milestone?.risk_flag || false,
    notes: milestone?.notes || '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.work_item_id) {
      setError('Select a work item.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const url = isEdit
        ? `${API_BASE_URL}/api/capital/milestones/${milestone.id}`
        : `${API_BASE_URL}/api/capital/projects/${project.id}/milestones`;
      const body = {
        userId: Number(userId),
        work_item_id: Number(form.work_item_id),
        name: form.name.trim(),
        target_date: form.target_date || null,
        actual_date: form.actual_date || null,
        status: form.status,
        risk_flag: form.risk_flag,
        notes: form.notes.trim() || null,
      };
      const res = await fetch(url, {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.detail || 'Could not save milestone.');
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
        <h3>{isEdit ? `Edit ${milestone.name}` : 'New milestone'}</h3>

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
          <label>Name</label>
          <input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="e.g. Foundation complete"
            required
            disabled={saving}
          />
        </div>

        <div className="capital-form-row">
          <div className="capital-field">
            <label>Target Date</label>
            <input
              type="date"
              value={form.target_date}
              onChange={(e) => setForm((f) => ({ ...f, target_date: e.target.value }))}
              disabled={saving}
            />
          </div>
          <div className="capital-field">
            <label>Actual Date</label>
            <input
              type="date"
              value={form.actual_date}
              onChange={(e) => setForm((f) => ({ ...f, actual_date: e.target.value }))}
              disabled={saving}
            />
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
          <div className="capital-field capital-checkbox-field">
            <label>
              <input
                type="checkbox"
                checked={form.risk_flag}
                onChange={(e) => setForm((f) => ({ ...f, risk_flag: e.target.checked }))}
                disabled={saving}
              />
              At risk
            </label>
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
            {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Add milestone'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function MilestonesTab({ userId, user, project }) {
  const [milestones, setMilestones] = useState([]);
  const [workItems, setWorkItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingMilestone, setEditingMilestone] = useState(null);

  const canEdit = isProjectOwner(project, user);

  const fetchAll = useCallback(async () => {
    if (!project) return;
    setLoading(true);
    try {
      const [msRes, wiRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/capital/projects/${project.id}/milestones?userId=${userId}`),
        fetch(`${API_BASE_URL}/api/capital/projects/${project.id}/work-items?userId=${userId}`),
      ]);
      const [msData, wiData] = await Promise.all([msRes.json(), wiRes.json()]);
      if (msData.success) setMilestones(msData.milestones || []);
      if (wiData.success) setWorkItems(wiData.work_items || []);
    } catch (err) {
      console.error('Fetch milestones error:', err);
    } finally {
      setLoading(false);
    }
  }, [project, userId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleSaved = () => {
    setShowForm(false);
    setEditingMilestone(null);
    fetchAll();
  };

  const noWorkItems = !loading && workItems.length === 0;

  return (
    <div className="capital-tab-panel">
      <div className="capital-dashboard-header">
        <h2>Milestones</h2>
        {canEdit && (
          <button
            className="capital-btn-primary"
            onClick={() => setShowForm(true)}
            disabled={noWorkItems}
            title={noWorkItems ? 'Add a work item first' : undefined}
          >
            + Add milestone
          </button>
        )}
      </div>

      {loading ? (
        <p className="capital-muted">Loading milestones…</p>
      ) : noWorkItems ? (
        <p className="capital-muted">
          No work items yet. {canEdit ? 'Add a work item first, then add milestones under it.' : 'Ask your project owner to set up work items.'}
        </p>
      ) : milestones.length === 0 ? (
        <p className="capital-muted">
          No milestones yet. {canEdit ? 'Add one to start tracking schedule.' : 'Ask your project owner to set up milestones.'}
        </p>
      ) : (
        <div className="capital-table-wrapper">
          <table className="capital-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Work Item</th>
                <th>Target Date</th>
                <th>Actual Date</th>
                <th>Status</th>
                <th>Risk</th>
                {canEdit && <th></th>}
              </tr>
            </thead>
            <tbody>
              {milestones.map((m) => (
                <tr key={m.id}>
                  <td>{m.name}</td>
                  <td>{m.work_item_name}</td>
                  <td>{m.target_date ? m.target_date.slice(0, 10) : '—'}</td>
                  <td>{m.actual_date ? m.actual_date.slice(0, 10) : '—'}</td>
                  <td>
                    <span className={`capital-status-pill capital-status-${m.status}`}>
                      {statusLabel(m.status)}
                    </span>
                  </td>
                  <td>
                    {m.risk_flag ? <span className="capital-risk-badge">At risk</span> : '—'}
                  </td>
                  {canEdit && (
                    <td>
                      <button className="capital-link-btn" onClick={() => setEditingMilestone(m)}>Edit</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <MilestoneForm userId={userId} project={project} workItems={workItems} onSaved={handleSaved} onCancel={() => setShowForm(false)} />
      )}
      {editingMilestone && (
        <MilestoneForm userId={userId} project={project} milestone={editingMilestone} workItems={workItems} onSaved={handleSaved} onCancel={() => setEditingMilestone(null)} />
      )}
    </div>
  );
}
