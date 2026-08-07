import React, { useContext, useEffect, useState } from 'react';
import { ProjectContext, ALL_PROJECTS } from '../../../contexts/ProjectContext';
import { isProjectOwner } from '../../capital/capitalUtils';
import BudgetOverview from '../../capital/pages/BudgetOverview';
import MilestonesTab from '../../capital/pages/MilestonesTab';
import ProjectSubsPanel from '../../project-subs/components/ProjectSubsPanel';
import '../styles/ProjectHub.css';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

const PIN_ICON = (filled) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
    <circle cx="12" cy="10" r="3" />
  </svg>
);

function PinButton({ pinned, onToggle }) {
  return (
    <button
      type="button"
      className={`ph-pin-btn${pinned ? ' ph-pin-btn-pinned' : ''}`}
      title={pinned ? 'Unpin from nav' : 'Pin to nav'}
      onClick={(e) => { e.stopPropagation(); onToggle(); }}
    >
      {PIN_ICON(pinned)}
    </button>
  );
}

function Card({ label, description, onOpen, disabled, comingSoon, appKey, pinnedApps, onTogglePin }) {
  return (
    <div
      className={`ph-card${disabled ? ' ph-card-disabled' : ''}`}
      onClick={disabled ? undefined : onOpen}
    >
      <div className="ph-card-body">
        <h3 className="ph-card-title">{label}</h3>
        {description && <p className="ph-card-desc">{description}</p>}
      </div>
      {comingSoon ? (
        <div className="ph-card-badge">Soon</div>
      ) : (
        <PinButton pinned={pinnedApps.includes(appKey)} onToggle={() => onTogglePin(appKey)} />
      )}
    </div>
  );
}

function viewFromQuery() {
  const view = new URLSearchParams(window.location.search).get('view');
  return ['budget', 'schedule', 'project-subs'].includes(view) ? view : null;
}

export default function ProjectDetailPage({ user, userId }) {
  const { projects, currentProjectId } = useContext(ProjectContext);
  const project = currentProjectId !== ALL_PROJECTS
    ? projects.find((p) => String(p.id) === String(currentProjectId))
    : null;

  const [activeView, setActiveView] = useState(viewFromQuery); // null | 'budget' | 'schedule' | 'project-subs'
  const [pinnedApps, setPinnedApps] = useState([]);

  const owner = isProjectOwner(project, user);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    fetch(`${API_BASE_URL}/api/user-preferences/pinned-apps?userId=${userId}`)
      .then((res) => res.json())
      .then((data) => { if (!cancelled && data.success) setPinnedApps(data.pinnedApps || []); })
      .catch((err) => console.error('Fetch pinned apps error:', err));
    return () => { cancelled = true; };
  }, [userId]);

  const togglePin = async (appKey) => {
    const isPinned = pinnedApps.includes(appKey);
    // Optimistic — this only affects the pin icon's own filled state and
    // the (separate) Sidebar nav section, neither of which this page
    // re-renders synchronously with, so there's nothing to roll back
    // visibly if the request fails; a console error is enough signal.
    setPinnedApps((prev) => (isPinned ? prev.filter((k) => k !== appKey) : [...prev, appKey]));
    try {
      const res = await fetch(
        isPinned
          ? `${API_BASE_URL}/api/user-preferences/pinned-apps/${appKey}?userId=${userId}`
          : `${API_BASE_URL}/api/user-preferences/pinned-apps`,
        isPinned
          ? { method: 'DELETE' }
          : {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ userId: Number(userId), appKey }),
            },
      );
      if (!res.ok) throw new Error(`${res.status}`);
    } catch (err) {
      console.error('Toggle pinned app error:', err);
    }
  };

  if (!project) {
    return (
      <div className="ph-container">
        <p className="ph-muted">Select a project from the header to view its details.</p>
      </div>
    );
  }

  if (activeView) {
    const viewTitles = { budget: 'Budget', schedule: 'Schedule', 'project-subs': 'Project - Subs' };
    return (
      <div className="ph-container">
        <button className="ph-back-btn" onClick={() => setActiveView(null)}>&larr; Back to {project.name}</button>
        <h1 className="ph-view-title">{viewTitles[activeView]}</h1>
        {activeView === 'budget' && <BudgetOverview userId={userId} user={user} project={project} />}
        {activeView === 'schedule' && <MilestonesTab userId={userId} user={user} project={project} />}
        {activeView === 'project-subs' && <ProjectSubsPanel userId={userId} user={user} project={project} />}
      </div>
    );
  }

  return (
    <div className="ph-container">
      <div className="ph-header">
        <div className="ph-badge">PROJECT</div>
        <h1 className="ph-title">{project.name}</h1>
      </div>

      <div className="ph-category">
        <div className="ph-category-label">Financial</div>
        <div className="ph-grid">
          <Card label="Budget" description="Budget vs. actual and spend by category" appKey="budget" pinnedApps={pinnedApps} onTogglePin={togglePin} onOpen={() => setActiveView('budget')} />
          <Card label="Invoices" description="Track invoices for this project" appKey="invoices" pinnedApps={pinnedApps} onTogglePin={togglePin} onOpen={() => { window.location.href = '/invoices'; }} />
        </div>
      </div>

      <div className="ph-category">
        <div className="ph-category-label">Field</div>
        <div className="ph-grid">
          <Card label="Daily logs" description="Crew, weather, delays, and site photos" appKey="daily_logs" pinnedApps={pinnedApps} onTogglePin={togglePin} onOpen={() => { window.location.href = '/daily-logs'; }} />
          {owner && (
            <Card label="Project - Subs" description="Subs invited to log site work on this project" appKey="project_subs" pinnedApps={pinnedApps} onTogglePin={togglePin} onOpen={() => setActiveView('project-subs')} />
          )}
        </div>
      </div>

      <div className="ph-category">
        <div className="ph-category-label">Schedule</div>
        <div className="ph-grid">
          <Card label="Schedule" description="Milestones and at-risk tracking" appKey="schedule" pinnedApps={pinnedApps} onTogglePin={togglePin} onOpen={() => setActiveView('schedule')} />
        </div>
      </div>

      <div className="ph-category">
        <div className="ph-category-label">Compliance</div>
        <div className="ph-grid">
          <Card label="Permits" description="Permit tracking — coming soon" disabled comingSoon />
          <Card label="Documents" description="Project documents" appKey="documents" pinnedApps={pinnedApps} onTogglePin={togglePin} onOpen={() => { window.location.href = '/documents'; }} />
        </div>
      </div>
    </div>
  );
}
