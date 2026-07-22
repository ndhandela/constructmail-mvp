import React, { useState, useEffect, useCallback } from 'react';
import ModuleLockedNotice, { isModuleLocked } from '../../../components/ModuleLockedNotice';
import CapitalTrackerDashboard from './CapitalTrackerDashboard';
import { API_BASE_URL } from '../capitalUtils';
import '../styles/CapitalTrackerApp.css';

export default function CapitalTrackerApp({ user, userId }) {
  // No region check here on purpose — unlike Trust, Capital Tracker is
  // available to any company (US and India), gated only by the 'capital'
  // feature flag.
  const capitalLocked = isModuleLocked(user?.active_modules, 'capital');

  const [projects, setProjects] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [loadingProjects, setLoadingProjects] = useState(true);

  const fetchProjects = useCallback(async () => {
    setLoadingProjects(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/capital/projects?userId=${userId}`);
      const data = await res.json();
      if (data.success) {
        setProjects(data.projects || []);
        setSelectedProjectId((prev) => prev || (data.projects[0] && data.projects[0].id));
      }
    } catch (err) {
      console.error('Fetch capital projects error:', err);
    } finally {
      setLoadingProjects(false);
    }
  }, [userId]);

  useEffect(() => {
    if (!capitalLocked && userId) fetchProjects();
  }, [capitalLocked, userId, fetchProjects]);

  if (capitalLocked) {
    return (
      <div className="capital-app">
        <ModuleLockedNotice moduleName="POMAR Capital Tracker" companyName={user?.company} />
      </div>
    );
  }

  const selectedProject = projects.find((p) => p.id === selectedProjectId) || null;

  return (
    <div className="capital-app">
      <div className="capital-hero">
        <div className="capital-badge">POMAR CAPITAL TRACKER</div>
        <h1>Budget vs. actual, without the spreadsheet</h1>
        <p>Track budgeted, committed, and actual spend by category for every project — one live view instead of a shared spreadsheet.</p>
      </div>

      <div className="capital-container">
        <div className="capital-toolbar">
          <div className="capital-project-picker">
            <label>Project</label>
            <select
              value={selectedProjectId || ''}
              onChange={(e) => setSelectedProjectId(Number(e.target.value))}
              disabled={loadingProjects || projects.length === 0}
            >
              {projects.length === 0 && <option value="">No projects yet</option>}
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
        </div>

        {loadingProjects ? (
          <p className="capital-muted">Loading projects…</p>
        ) : projects.length === 0 ? (
          <p className="capital-muted">No projects yet. Create a project first, then come back here to set up its budget.</p>
        ) : (
          <CapitalTrackerDashboard
            userId={userId}
            user={user}
            project={selectedProject}
            onBudgetChanged={fetchProjects}
          />
        )}
      </div>
    </div>
  );
}
