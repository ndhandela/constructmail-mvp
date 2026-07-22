import React, { useContext } from 'react';
import ModuleLockedNotice, { isModuleLocked } from '../../../components/ModuleLockedNotice';
import CapitalTrackerDashboard from './CapitalTrackerDashboard';
import { ProjectContext, ALL_PROJECTS } from '../../../contexts/ProjectContext';
import '../styles/CapitalTrackerApp.css';

export default function CapitalTrackerApp({ user, userId }) {
  // No region check here on purpose — unlike Trust, Capital Tracker is
  // available to any company (US and India), gated only by the 'capital'
  // feature flag.
  const capitalLocked = isModuleLocked(user?.active_modules, 'capital');

  // Project selection comes from the shared header/sidebar switcher, same
  // as Mail/Clash/Vendors — no separate in-page picker.
  const { projects, currentProjectId } = useContext(ProjectContext);
  const selectedProject = currentProjectId !== ALL_PROJECTS
    ? projects.find((p) => String(p.id) === String(currentProjectId))
    : null;

  if (capitalLocked) {
    return (
      <div className="capital-app">
        <ModuleLockedNotice
          moduleName="POMAR Capital Tracker"
          companyName={user?.company}
          variant="upgrade"
          icon="💰"
          description="Track budgeted, committed, and actual spend by category for every project. Upgrade your plan to unlock Capital Tracker."
        />
      </div>
    );
  }

  return (
    <div className="capital-app">
      <div className="capital-hero">
        <div className="capital-badge">POMAR CAPITAL TRACKER</div>
        <h1>Budget vs. actual, without the spreadsheet</h1>
        <p>Track budgeted, committed, and actual spend by category for every project — one live view instead of a shared spreadsheet.</p>
      </div>

      <div className="capital-container">
        {!selectedProject ? (
          <p className="capital-muted">Select a project from the header to view its budget.</p>
        ) : (
          <CapitalTrackerDashboard userId={userId} user={user} project={selectedProject} />
        )}
      </div>
    </div>
  );
}
