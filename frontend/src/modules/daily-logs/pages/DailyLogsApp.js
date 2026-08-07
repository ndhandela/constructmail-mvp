import React, { useContext, useState } from 'react';
import ModuleLockedNotice, { isModuleLocked } from '../../../components/ModuleLockedNotice';
import BackToProjectLink from '../../../components/BackToProjectLink';
import DailyLogsList from './DailyLogsList';
import DailyLogForm from './DailyLogForm';
import ProjectSubsPanel from '../../project-subs/components/ProjectSubsPanel';
import { ProjectContext, ALL_PROJECTS } from '../../../contexts/ProjectContext';
import { isProjectOwner } from '../../capital/capitalUtils';
import { API_BASE_URL } from '../dailyLogsUtils';
import '../styles/DailyLogsApp.css';

const TABS = [
  { key: 'logs', label: 'Logs' },
  { key: 'vendors', label: 'Vendors' },
];

function VendorInviteBanner({ invites, userId, user, onAccepted }) {
  const [acceptingId, setAcceptingId] = useState(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');

  // A lead account (created by the invite itself) has no password yet —
  // require setting one as part of this same accept action, since a magic
  // link alone would otherwise leave them unable to log in again later.
  // A sub who already has a password (accepting a second project's invite)
  // isn't asked again.
  const needsPassword = !user?.has_password;

  const accept = async (invite) => {
    setError('');
    if (needsPassword) {
      if (password.length < 8) {
        setError('Password must be at least 8 characters.');
        return;
      }
      if (password !== confirmPassword) {
        setError('Passwords do not match.');
        return;
      }
    }
    setAcceptingId(invite.access_id);
    try {
      const res = await fetch(`${API_BASE_URL}/api/project-vendors/${invite.access_id}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: Number(userId),
          ...(needsPassword ? { password } : {}),
        }),
      });
      const data = await res.json();
      if (data.success) {
        onAccepted();
      } else {
        setError(data.detail || 'Could not accept invite.');
      }
    } catch (err) {
      console.error('Accept vendor invite error:', err);
      setError('Network error. Try again.');
    } finally {
      setAcceptingId(null);
    }
  };

  return (
    <div className="dailylogs-invite-banner">
      {needsPassword && (
        <div className="dailylogs-invite-card dailylogs-invite-password-setup">
          <p>Set a password for your account so you can log back in later — this account was created by the invite below and has no password yet.</p>
          <div className="dailylogs-form-row">
            <div className="dailylogs-field">
              <label>Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                autoComplete="new-password"
              />
            </div>
            <div className="dailylogs-field">
              <label>Confirm password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>
          </div>
        </div>
      )}
      {error && <div className="dailylogs-error">{error}</div>}
      {invites.map((invite) => (
        <div key={invite.access_id} className="dailylogs-invite-card">
          <div>
            <strong>{invite.invited_by_name}</strong> invited you to log site work on{' '}
            <strong>{invite.project_name}</strong>
            {invite.role ? ` as ${invite.role}` : ''}.
          </div>
          <button
            className="dailylogs-btn-primary"
            disabled={acceptingId === invite.access_id}
            onClick={() => accept(invite)}
          >
            {acceptingId === invite.access_id ? 'Accepting…' : 'Accept'}
          </button>
        </div>
      ))}
    </div>
  );
}

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
  const [activeTab, setActiveTab] = useState('logs');

  const owner = isProjectOwner(selectedProject, user);
  const pendingInvites = user?.pending_vendor_invites || [];

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
      <BackToProjectLink user={user} />
      <div className="dailylogs-hero">
        <div className="dailylogs-badge">POMAR DAILY LOGS</div>
        <h1>Replace the paper logbook</h1>
        <p>Log crew, weather, delays, and site photos from your phone in under two minutes — one live record per project instead of a notebook in the site trailer.</p>
      </div>

      <div className="dailylogs-container">
        {pendingInvites.length > 0 && (
          <VendorInviteBanner
            invites={pendingInvites}
            userId={userId}
            user={user}
            // Full reload rather than refreshProjects(): this app has no
            // client router (see AppLayout.js), and a reload is the only
            // way to also refetch `user.pending_vendor_invites` (fetched
            // once at the App.js top level on load) so the banner clears
            // for the invite that was just accepted.
            onAccepted={() => window.location.reload()}
          />
        )}

        {!selectedProject ? (
          <p className="dailylogs-muted">Select a project from the header to view its logs.</p>
        ) : (
          <>
            {/* Phase 3 cutover: this Vendors tab is redundant on the new nav
                — Project Detail's "Project - Subs" card reaches the same
                ProjectSubsPanel directly (see modules/project-subs). Only
                hidden behind 'new_nav' so unflagged accounts keep this
                exactly as it was, for rollback. */}
            {owner && !user?.new_nav_enabled && (
              <div className="dailylogs-tabs">
                {TABS.map((tab) => (
                  <button
                    key={tab.key}
                    className={`dailylogs-tab${activeTab === tab.key ? ' dailylogs-tab-active' : ''}`}
                    onClick={() => setActiveTab(tab.key)}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            )}

            {owner && !user?.new_nav_enabled && activeTab === 'vendors' ? (
              <ProjectSubsPanel userId={userId} user={user} project={selectedProject} />
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
                    user={user}
                    onSaved={handleSaved}
                    onCancel={() => setShowForm(false)}
                  />
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
