import React, { useContext, useEffect, useState } from 'react';
import { ProjectContext } from '../../../contexts/ProjectContext';
import { isModuleLocked } from '../../../components/ModuleLockedNotice';
import { API_BASE_URL, formatCurrency } from '../../capital/capitalUtils';
import '../styles/ProjectHub.css';

const CHECK_ICON = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const WARN_ICON = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 9v4M12 17h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
  </svg>
);

// signal is null when the module isn't enabled for the caller's company
// (routers/capital.py's list_capital_projects) — shown as a neutral, unlit
// row rather than hidden, so the card's shape stays consistent across
// projects/companies with different modules turned on.
function SignalRow({ label, signal, warnStatuses }) {
  const isNeutral = !signal;
  const isWarn = signal && warnStatuses.includes(signal.status);
  const tone = isNeutral ? 'neutral' : isWarn ? 'warn' : 'ok';

  return (
    <div className={`ph-signal-row ph-signal-${tone}`}>
      <span className="ph-signal-icon">{isNeutral ? '—' : isWarn ? WARN_ICON : CHECK_ICON}</span>
      <span className="ph-signal-label">{label}</span>
      <span className="ph-signal-text">{isNeutral ? 'Not enabled' : signal.label}</span>
    </div>
  );
}

function ProjectCard({ project, summary, loading, onOpen }) {
  const budgetSummary = summary?.budget_summary;
  const budgeted = Number(budgetSummary?.total_budgeted) || 0;
  const actual = Number(budgetSummary?.total_actual) || 0;
  const percentSpent = summary?.budget_spent_pct ?? null;
  const needsAttention = summary?.overall_status === 'needs_attention';

  return (
    <div className="ph-overview-card" onClick={onOpen}>
      <div className="ph-overview-card-header">
        <h3 className="ph-overview-card-title">{project.name}</h3>
        {summary && (
          <span className={`ph-status-pill ${needsAttention ? 'ph-status-pill-warn' : 'ph-status-pill-ok'}`}>
            {needsAttention ? 'Needs attention' : 'On track'}
          </span>
        )}
      </div>

      {loading ? (
        <p className="ph-muted">Loading…</p>
      ) : (
        <>
          <div className="ph-overview-stat-row">
            <span className="ph-overview-stat-label">Budget spent</span>
            <span className="ph-overview-stat-value">
              {percentSpent === null ? '—' : `${percentSpent}%`}
            </span>
          </div>
          {percentSpent !== null && (
            <div className="ph-overview-progress-track">
              <div
                className={`ph-overview-progress-fill${percentSpent > 100 ? ' ph-overview-progress-fill-over' : ''}`}
                style={{ width: `${Math.min(percentSpent, 100)}%` }}
              />
            </div>
          )}
          <p className="ph-muted" style={{ marginTop: 4, marginBottom: 0 }}>
            {formatCurrency(actual)} of {formatCurrency(budgeted)}
          </p>

          <div className="ph-overview-signals">
            <SignalRow label="Permits" signal={summary?.permits_status} warnStatuses={['expiring_soon', 'expired']} />
            <SignalRow label="Milestones" signal={summary?.milestones_status} warnStatuses={['due_soon', 'overdue']} />
            <SignalRow label="Invoices" signal={summary?.invoices_status} warnStatuses={['overdue']} />
          </div>
        </>
      )}
    </div>
  );
}

export default function ProjectsOverviewPage({ user, userId }) {
  const { projects, setCurrentProjectId } = useContext(ProjectContext);
  const capitalLocked = isModuleLocked(user?.active_modules, 'capital', user?.account_status);

  const [summaries, setSummaries] = useState({});
  const [loading, setLoading] = useState(!capitalLocked);

  useEffect(() => {
    if (capitalLocked) return;
    let cancelled = false;
    setLoading(true);
    fetch(`${API_BASE_URL}/api/capital/projects?userId=${userId}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled || !data.success) return;
        const byId = {};
        for (const p of data.projects || []) byId[p.id] = p;
        setSummaries(byId);
      })
      .catch((err) => console.error('Fetch projects overview error:', err))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [userId, capitalLocked]);

  const openProject = (project) => {
    // Full page nav (this app has no client router) — set the shared
    // header/sidebar project switcher first so Project Detail lands on the
    // project that was clicked, not whatever was previously selected.
    setCurrentProjectId(String(project.id));
    window.location.href = '/project';
  };

  return (
    <div className="ph-container">
      <div className="ph-header">
        <div className="ph-badge">DASHBOARD</div>
        <h1 className="ph-title">Your projects</h1>
      </div>

      {projects.length === 0 ? (
        <p className="ph-muted">No projects yet.</p>
      ) : (
        <div className="ph-overview-grid">
          {projects.map((project) => (
            capitalLocked ? (
              <div key={project.id} className="ph-overview-card" onClick={() => openProject(project)}>
                <h3 className="ph-overview-card-title">{project.name}</h3>
                <p className="ph-muted">Upgrade to Capital Tracker to see budget and status here.</p>
              </div>
            ) : (
              <ProjectCard
                key={project.id}
                project={project}
                summary={summaries[project.id]}
                loading={loading}
                onOpen={() => openProject(project)}
              />
            )
          ))}
        </div>
      )}
    </div>
  );
}
