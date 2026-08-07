import React, { useContext, useEffect, useState } from 'react';
import { ProjectContext } from '../../../contexts/ProjectContext';
import { isModuleLocked } from '../../../components/ModuleLockedNotice';
import { API_BASE_URL, formatCurrency } from '../../capital/capitalUtils';
import '../styles/ProjectHub.css';

// Pulls from the same Capital Tracker endpoints BudgetItemsTab/MilestonesTab
// use — no duplicated budget/at-risk logic, just a per-project summary of
// data those tabs already fetch in full.
function ProjectCard({ project, userId, capitalLocked, onOpen }) {
  const [summary, setSummary] = useState(null);
  const [atRiskCount, setAtRiskCount] = useState(null);
  const [loading, setLoading] = useState(!capitalLocked);

  useEffect(() => {
    if (capitalLocked) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([
      fetch(`${API_BASE_URL}/api/capital/projects/${project.id}/items?userId=${userId}`).then((r) => r.json()),
      fetch(`${API_BASE_URL}/api/capital/projects/${project.id}/milestones?userId=${userId}`).then((r) => r.json()),
    ])
      .then(([itemsData, milestonesData]) => {
        if (cancelled) return;
        if (itemsData.success) setSummary(itemsData.budget_summary || null);
        if (milestonesData.success) {
          const list = milestonesData.milestones || [];
          setAtRiskCount(list.filter((m) => m.status === 'at_risk' || m.risk_flag).length);
        }
      })
      .catch((err) => console.error('Fetch project overview data error:', err))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [project.id, userId, capitalLocked]);

  const budgeted = Number(summary?.total_budgeted) || 0;
  const actual = Number(summary?.total_actual) || 0;
  const percentSpent = budgeted > 0 ? Math.round((actual / budgeted) * 100) : null;

  return (
    <div className="ph-overview-card" onClick={onOpen}>
      <h3 className="ph-overview-card-title">{project.name}</h3>

      {capitalLocked ? (
        <p className="ph-muted">Upgrade to Capital Tracker to see budget and milestone status here.</p>
      ) : loading ? (
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

          {atRiskCount > 0 && (
            <div className="ph-overview-badge">{atRiskCount} at-risk milestone{atRiskCount === 1 ? '' : 's'}</div>
          )}
        </>
      )}
    </div>
  );
}

export default function ProjectsOverviewPage({ user, userId }) {
  const { projects, setCurrentProjectId } = useContext(ProjectContext);
  const capitalLocked = isModuleLocked(user?.active_modules, 'capital');

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
            <ProjectCard
              key={project.id}
              project={project}
              userId={userId}
              capitalLocked={capitalLocked}
              onOpen={() => openProject(project)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
