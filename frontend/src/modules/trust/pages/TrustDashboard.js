import React, { useState, useEffect, useCallback } from 'react';
import { API_BASE_URL, canReviewTrust } from '../trustUtils';
import '../styles/TrustDashboard.css';

function dueBadge(lastQpr) {
  if (!lastQpr || !lastQpr.due_date) return { text: 'No QPR yet', color: 'var(--slate)' };
  if (lastQpr.status === 'filed') return { text: `${lastQpr.quarter} filed`, color: 'var(--sage)' };

  const daysLeft = Math.ceil((new Date(lastQpr.due_date) - new Date()) / 86400000);
  if (daysLeft < 0) return { text: `${lastQpr.quarter} overdue`, color: 'var(--brick)' };
  if (daysLeft <= 7) return { text: `${lastQpr.quarter} due in ${daysLeft}d`, color: 'var(--brick)' };
  return { text: `${lastQpr.quarter} due ${lastQpr.due_date}`, color: 'var(--sage)' };
}

const PROJECT_MODES = [
  { key: 'standalone', label: 'Create a standalone Trust project' },
  { key: 'link_existing', label: 'Link to an existing project' },
  { key: 'create_linked', label: 'Create a new project for both' },
];

function NewProjectForm({ userId, states, canLinkProjects, onCreated, onCancel }) {
  const [mode, setMode] = useState('standalone');
  const [form, setForm] = useState({ project_name: '', rera_registration_number: '', rera_state: 'TG', unit_count: '' });
  const [existingProjectId, setExistingProjectId] = useState('');
  const [existingProjects, setExistingProjects] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const selectedState = states.find((s) => s.code === form.rera_state);

  useEffect(() => {
    if (mode !== 'link_existing' || !canLinkProjects) return;
    fetch(`${API_BASE_URL}/api/projects?userId=${userId}`)
      .then((res) => res.json())
      .then((data) => { if (data.success) setExistingProjects(data.projects || []); })
      .catch(() => setExistingProjects([]));
  }, [mode, canLinkProjects, userId]);

  const handleExistingProjectSelect = (id) => {
    setExistingProjectId(id);
    const picked = existingProjects.find((p) => String(p.id) === String(id));
    if (picked && !form.project_name) {
      setForm((f) => ({ ...f, project_name: picked.name }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (mode === 'link_existing' && !existingProjectId) {
      setError('Select a project to link to.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE_URL}/api/trust/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: Number(userId),
          project_name: form.project_name.trim(),
          rera_registration_number: form.rera_registration_number.trim() || null,
          rera_state: form.rera_state,
          unit_count: form.unit_count ? Number(form.unit_count) : null,
          mode,
          existing_project_id: mode === 'link_existing' ? Number(existingProjectId) : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.detail || 'Could not create project.');
        return;
      }
      onCreated();
    } catch (err) {
      setError('Network error. Try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="trust-new-project-form" onSubmit={handleSubmit}>
      <h3>New RERA Project</h3>

      {canLinkProjects && (
        <div className="trust-project-mode-picker">
          {PROJECT_MODES.map((m) => (
            <label key={m.key} className="trust-project-mode-option">
              <input
                type="radio"
                name="project-mode"
                checked={mode === m.key}
                onChange={() => setMode(m.key)}
                disabled={saving}
              />
              {m.label}
            </label>
          ))}
        </div>
      )}

      {mode === 'link_existing' && canLinkProjects && (
        <div className="trust-field" style={{ marginBottom: 14 }}>
          <label>Existing project</label>
          <select
            value={existingProjectId}
            onChange={(e) => handleExistingProjectSelect(e.target.value)}
            disabled={saving}
          >
            <option value="">Select a project…</option>
            {existingProjects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
      )}

      <div className="trust-form-row">
        <div className="trust-field">
          <label>Project Name</label>
          <input
            value={form.project_name}
            onChange={(e) => setForm((f) => ({ ...f, project_name: e.target.value }))}
            required
            disabled={saving}
          />
        </div>
        <div className="trust-field">
          <label>State</label>
          <select
            value={form.rera_state}
            onChange={(e) => setForm((f) => ({ ...f, rera_state: e.target.value }))}
            disabled={saving || states.length === 0}
          >
            {states.map((s) => (
              <option key={s.code} value={s.code}>
                {s.label}{s.implemented ? '' : ' — coming soon'}
              </option>
            ))}
          </select>
        </div>
        <div className="trust-field">
          <label>RERA Registration #</label>
          <input
            value={form.rera_registration_number}
            onChange={(e) => setForm((f) => ({ ...f, rera_registration_number: e.target.value }))}
            disabled={saving}
          />
        </div>
        <div className="trust-field">
          <label>Unit Count</label>
          <input
            type="number"
            value={form.unit_count}
            onChange={(e) => setForm((f) => ({ ...f, unit_count: e.target.value }))}
            disabled={saving}
          />
        </div>
      </div>
      {/* Full-width, below the whole row — rendered here rather than inside the
          State field's own column so its presence/absence never changes the
          row's height and knocks the four inputs out of alignment. */}
      <div className="trust-state-helper-slot">
        {selectedState && !selectedState.implemented && (
          <span className="trust-state-badge trust-state-badge-soon">
            QPR generation coming soon for {selectedState.label} — Change Alerts and Audit Trail work now
          </span>
        )}
      </div>

      {error && <div className="trust-error">{error}</div>}
      <div className="trust-form-actions">
        <button type="button" className="trust-btn-secondary" onClick={onCancel} disabled={saving}>Cancel</button>
        <button type="submit" className="trust-btn-primary" disabled={saving}>
          {saving ? 'Creating…' : 'Create project'}
        </button>
      </div>
    </form>
  );
}

function stateLabel(stateProfiles, code) {
  return stateProfiles.find((s) => s.code === code)?.label || code;
}

export default function TrustDashboard({ userId, projects, loadingProjects, trustRole, stateProfiles, canLinkProjects, onProjectCreated, onSelectProject }) {
  const [summaries, setSummaries] = useState({});
  const [showNewProject, setShowNewProject] = useState(false);

  const fetchSummaries = useCallback(async () => {
    const entries = await Promise.all(projects.map(async (p) => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/trust/projects/${p.id}/dashboard?userId=${userId}`);
        const data = await res.json();
        return [p.id, data.success ? data : null];
      } catch {
        return [p.id, null];
      }
    }));
    setSummaries(Object.fromEntries(entries));
  }, [projects, userId]);

  useEffect(() => { if (projects.length > 0) fetchSummaries(); }, [projects, fetchSummaries]);

  return (
    <div className="trust-dashboard">
      <div className="trust-dashboard-header">
        <h2>Projects</h2>
        {canReviewTrust(trustRole) && !showNewProject && (
          <button className="trust-btn-primary" onClick={() => setShowNewProject(true)}>+ New project</button>
        )}
      </div>

      {showNewProject && (
        <NewProjectForm
          userId={userId}
          states={stateProfiles}
          canLinkProjects={canLinkProjects}
          onCreated={() => { setShowNewProject(false); onProjectCreated(); }}
          onCancel={() => setShowNewProject(false)}
        />
      )}

      {loadingProjects ? (
        <p className="trust-muted">Loading projects…</p>
      ) : projects.length === 0 ? (
        <p className="trust-muted">No RERA projects yet. {canReviewTrust(trustRole) ? 'Create one to get started.' : 'Ask your GC Owner or Compliance Reviewer to set one up.'}</p>
      ) : (
        <div className="trust-project-grid">
          {projects.map((p) => {
            const summary = summaries[p.id];
            const badge = dueBadge(summary?.last_qpr);
            return (
              <div key={p.id} className="trust-project-card" onClick={() => onSelectProject(p.id)}>
                <div className="trust-project-card-header">
                  <h3>{p.project_name}</h3>
                  <span className="trust-due-badge" style={{ color: badge.color, borderColor: badge.color }}>
                    {badge.text}
                  </span>
                </div>
                <p className="trust-muted">
                  {stateLabel(stateProfiles, p.rera_state)}-RERA {p.rera_registration_number || 'unregistered'} · {p.unit_count || '—'} units
                </p>
                {p.linked_project_id && (
                  <p className="trust-linked-indicator">🔗 Linked to: {p.linked_project_name || 'another project'}</p>
                )}
                <div className="trust-project-card-stats">
                  <span>{summary?.open_alert_count ?? '—'} open alerts</span>
                  <span>{summary?.upload_count ?? '—'} uploads</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
