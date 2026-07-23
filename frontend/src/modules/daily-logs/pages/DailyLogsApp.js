import React, { useContext, useState } from 'react';
import ModuleLockedNotice, { isModuleLocked } from '../../../components/ModuleLockedNotice';
import DailyLogsList from './DailyLogsList';
import DailyLogForm from './DailyLogForm';
import { ProjectContext, ALL_PROJECTS } from '../../../contexts/ProjectContext';
import '../styles/DailyLogsApp.css';

export default function DailyLogsApp({ user, userId }) {
  // No region check here on purpose — like Capital Tracker, Daily Logs is
  // available to any company (US and India), gated only by the
  // 'daily_logs' feature flag.
  const dailyLogsLocked = isModuleLocked(user?.active_modules, 'daily_logs');

  // Project selection comes from the shared header/sidebar switcher, same
  // as Mail/Clash/Vendors/Capital — no separate in-page picker.
  const { projects, currentProjectId } = useContext(ProjectContext);
  const selectedProject = currentProjectId !== ALL_PROJECTS
    ? projects.find((p) => String(p.id) === String(currentProjectId))
    : null;

  const [showForm, setShowForm] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  if (dailyLogsLocked) {
    return (
      <div className="dailylogs-app">
        <ModuleLockedNotice
          moduleName="POMAR Daily Logs"
          companyName={user?.company}
          variant="upgrade"
          icon="📋"
          description="Replace the paper logbook. Log crew, weather, delays, and site photos from your phone in under two minutes. Upgrade your plan to unlock Daily Logs."
        />
      </div>
    );
  }

  const handleSaved = () => {
    setShowForm(false);
    setRefreshKey((k) => k + 1);
  };

  return (
    <div className="dailylogs-app">
      <div className="dailylogs-hero">
        <div className="dailylogs-badge">POMAR DAILY LOGS</div>
        <h1>Replace the paper logbook</h1>
        <p>Log crew, weather, delays, and site photos from your phone in under two minutes — one live record per project instead of a notebook in the site trailer.</p>
      </div>

      <div className="dailylogs-container">
        {!selectedProject ? (
          <p className="dailylogs-muted">Select a project from the header to view its logs.</p>
        ) : (
          <>
            <div className="dailylogs-dashboard-header">
              <h2>Daily Logs</h2>
              <button className="dailylogs-btn-primary" onClick={() => setShowForm(true)}>+ New log</button>
            </div>

            <DailyLogsList userId={userId} user={user} project={selectedProject} refreshKey={refreshKey} />

            {showForm && (
              <DailyLogForm
                userId={userId}
                project={selectedProject}
                onSaved={handleSaved}
                onCancel={() => setShowForm(false)}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
