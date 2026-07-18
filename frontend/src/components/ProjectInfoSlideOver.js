import React, { useState, useEffect, useContext } from 'react';
import { createPortal } from 'react-dom';
import { ProjectContext } from '../contexts/ProjectContext';
import { useUnsavedChanges } from '../contexts/UnsavedChangesContext';
import '../styles/ProjectInfoSlideOver.css';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

// Must match PROJECT_STATUSES in fastapi_backend/routers/projects.py.
const STATUS_LABELS = {
  planning: 'Planning',
  active: 'Active',
  on_hold: 'On Hold',
  completed: 'Completed',
};

function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] || '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase();
}

export default function ProjectInfoSlideOver({ projectId, projectName, userId, onClose }) {
  const { projects } = useContext(ProjectContext);
  const { guardNavigation } = useUnsavedChanges();
  const [tab, setTab] = useState('info');
  const [members, setMembers] = useState([]);
  const [pendingInvites, setPendingInvites] = useState([]);
  const [loading, setLoading] = useState(true);

  const project = projects.find((p) => String(p.id) === String(projectId));
  const owner = members.find((m) => m.role === 'owner');
  const ownerName = owner ? (owner.full_name || owner.name || owner.email) : null;

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  useEffect(() => {
    if (!projectId || !userId) return;
    setLoading(true);
    fetch(`${API_BASE_URL}/api/projects/${projectId}/members?userId=${userId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setMembers(data.members || []);
          setPendingInvites(data.pending_invites || []);
        }
      })
      .catch((err) => console.error('Fetch project members error:', err))
      .finally(() => setLoading(false));
  }, [projectId, userId]);

  const goToEditPage = (section) => {
    onClose();
    guardNavigation(() => {
      window.location.href = `/dashboard?view=projects-edit&section=${section}&projectId=${projectId}`;
    });
  };

  return createPortal(
    <>
      <div className="pis-overlay" onClick={onClose} />
      <aside className="pis-panel" role="dialog" aria-modal="true" aria-label="Project info">
        <div className="pis-header">
          <div>
            <p className="pis-eyebrow">Project</p>
            <h3 className="pis-title">{project?.name || projectName || 'Project'}</h3>
          </div>
          <button className="pis-close-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="pis-tabs">
          <button
            className={`pis-tab ${tab === 'info' ? 'active' : ''}`}
            onClick={() => setTab('info')}
          >
            Info
          </button>
          <button
            className={`pis-tab ${tab === 'team' ? 'active' : ''}`}
            onClick={() => setTab('team')}
          >
            Team
          </button>
        </div>

        <div className="pis-body">
          {tab === 'info' ? (
            <div className="pis-info-list">
              <div className="pis-info-row">
                <span className="pis-info-label">Owner</span>
                <span className={`pis-info-value ${ownerName ? '' : 'pis-info-muted'}`}>
                  {ownerName || 'Not set'}
                </span>
              </div>
              <div className="pis-info-row">
                <span className="pis-info-label">Status</span>
                <span className={`pis-info-value ${project?.status ? '' : 'pis-info-muted'}`}>
                  {STATUS_LABELS[project?.status] || 'Not set'}
                </span>
              </div>
              <div className="pis-info-row">
                <span className="pis-info-label">Location</span>
                <span className={`pis-info-value ${project?.location ? '' : 'pis-info-muted'}`}>
                  {project?.location || 'Not set'}
                </span>
              </div>
              <div className="pis-info-row">
                <span className="pis-info-label">Start date</span>
                <span className={`pis-info-value ${project?.start_date ? '' : 'pis-info-muted'}`}>
                  {project?.start_date || 'Not set'}
                </span>
              </div>
              <div className="pis-info-row">
                <span className="pis-info-label">Project number</span>
                <span className="pis-info-value">{project?.project_number || '—'}</span>
              </div>
              <div className="pis-info-row">
                <span className="pis-info-label">Client</span>
                <span className="pis-info-value">{project?.client_name || '—'}</span>
              </div>
            </div>
          ) : (
            <div className="pis-team-list">
              {loading ? (
                <p className="pis-empty">Loading…</p>
              ) : members.length === 0 ? (
                <p className="pis-empty">No team members yet.</p>
              ) : (
                members.map((m) => (
                  <div key={m.user_id} className="pis-team-row">
                    <div className="pis-team-avatar">{getInitials(m.full_name || m.name || m.email)}</div>
                    <div className="pis-team-info">
                      <div className="pis-team-name">{m.full_name || m.name || m.email}</div>
                      <div className="pis-team-role">{m.role}</div>
                    </div>
                  </div>
                ))
              )}
              {pendingInvites.length > 0 && (
                <>
                  <p className="pis-section-label">Pending invites</p>
                  {pendingInvites.map((inv) => (
                    <div key={inv.email} className="pis-team-row pis-team-row-pending">
                      <div className="pis-team-avatar pis-team-avatar-pending">…</div>
                      <div className="pis-team-info">
                        <div className="pis-team-name">{inv.email}</div>
                        <div className="pis-team-role">{inv.role} · pending</div>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
        </div>

        <div className="pis-footer">
          {tab === 'info' ? (
            <button className="pis-edit-btn" onClick={() => goToEditPage('info')}>
              Edit Project Info
            </button>
          ) : (
            <button className="pis-edit-btn" onClick={() => goToEditPage('team')}>
              Edit Team Members
            </button>
          )}
        </div>
      </aside>
    </>,
    document.body
  );
}
