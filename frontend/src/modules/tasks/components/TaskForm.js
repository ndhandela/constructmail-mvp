import React, { useState } from 'react';
import { API_BASE_URL } from '../tasksUtils';

// projectId is fixed for the life of this form — sourced from the header's
// ProjectContext.currentProjectId by TaskTrackerApp.js, same pattern as
// modules/permits/components/PermitForm.js.
export default function TaskForm({ userId, projectId, task, assignableUsers, onSaved, onCancel }) {
  const isEdit = !!task;
  const [form, setForm] = useState({
    title: task?.title || '',
    description: task?.description || '',
    assigned_to: task?.assigned_to != null ? String(task.assigned_to) : '',
    due_date: task?.due_date || '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!projectId) { setError('No project selected. Choose one from the header first.'); return; }
    if (!form.title.trim()) { setError('Title is required.'); return; }

    setSaving(true);
    setError('');
    try {
      const payload = {
        userId: Number(userId),
        title: form.title.trim(),
        description: form.description.trim() || null,
        assigned_to: form.assigned_to ? Number(form.assigned_to) : null,
        due_date: form.due_date || null,
      };

      const res = isEdit
        ? await fetch(`${API_BASE_URL}/api/tasks/${task.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
        : await fetch(`${API_BASE_URL}/api/tasks/projects/${projectId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
      const data = await res.json();
      if (!res.ok) {
        setError((typeof data.detail === 'string' && data.detail) || 'Could not save task.');
        return;
      }
      onSaved();
    } catch (err) {
      console.error('Save task error:', err);
      setError('Network error. Try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="tasks-modal-overlay" onClick={onCancel}>
      <form className="tasks-modal" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <h3>{isEdit ? 'Edit task' : 'Add task'}</h3>

        <div className="tasks-field">
          <label>Title</label>
          <input
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            placeholder="e.g. Confirm rebar delivery"
            required
            disabled={saving}
          />
        </div>

        <div className="tasks-field">
          <label>Description</label>
          <textarea
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            rows={3}
            disabled={saving}
          />
        </div>

        <div className="tasks-form-row">
          <div className="tasks-field">
            <label>Assigned To</label>
            <select
              value={form.assigned_to}
              onChange={(e) => setForm((f) => ({ ...f, assigned_to: e.target.value }))}
              disabled={saving}
            >
              <option value="">Unassigned</option>
              {assignableUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.company_name ? `${u.user_name} (${u.company_name})` : u.user_name}
                </option>
              ))}
            </select>
          </div>
          <div className="tasks-field">
            <label>Due Date</label>
            <input
              type="date"
              value={form.due_date}
              onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))}
              disabled={saving}
            />
          </div>
        </div>

        {error && <div className="tasks-error">{error}</div>}
        <div className="tasks-form-actions">
          <button type="button" className="tasks-btn-secondary" onClick={onCancel} disabled={saving}>Cancel</button>
          <button type="submit" className="tasks-btn-primary" disabled={saving}>
            {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Add task'}
          </button>
        </div>
      </form>
    </div>
  );
}
