import React, { useState, useRef, useContext } from 'react';
import PomarLogo from './PomarLogo';
import NewProjectModal from './NewProjectModal';
import ProjectInfoSlideOver from './ProjectInfoSlideOver';
import { ProjectContext, ALL_PROJECTS } from '../contexts/ProjectContext';
import { getProductById } from '../config/products';
import '../styles/Header.css';

// Roles allowed to create new projects — mirrors PROJECT_CREATOR_ROLES in
// fastapi_backend/routers/projects.py. Hiding the action here is just UX;
// the server enforces this independently.
const PROJECT_CREATOR_ROLES = ['GC', 'Owner'];

function getDisplayName(user) {
  if (!user) return '';
  if (user.first_name || user.last_name) {
    return `${user.first_name || ''} ${user.last_name || ''}`.trim();
  }
  return user.full_name || user.name || user.email || '';
}

function getInitials(name) {
  if (!name) return '';
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] || '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase();
}

// Platform dropdown shown to logged-out visitors — links to public marketing
// pages (product.marketingPath), never to the authenticated app routes.
const PLATFORM_DROPDOWN_IDS = ['constructmail', 'clash', 'vendors', 'marketplace', 'daily_logs'];

export default function Header({ userId, onLogout, user }) {
  const isLoggedIn = !!userId;

  const [platformOpen, setPlatformOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [projectOpen, setProjectOpen] = useState(false);
  const [showNewProject, setShowNewProject] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);

  const platformTimer = useRef(null);
  const profileTimer  = useRef(null);
  const projectTimer  = useRef(null);

  const { projects, currentProjectId, setCurrentProjectId, refreshProjects } = useContext(ProjectContext);
  const canCreateProject = PROJECT_CREATOR_ROLES.includes(user?.role);

  const currentPath = window.location.pathname;
  // Trust has its own project concept (trust_projects) — the shared
  // ProjectContext switcher/info panel doesn't apply there. See ProjectGate
  // usage in App.js and the comment on TrustApp's route. Capital Tracker
  // uses the generic projects table like Mail/Clash/Vendors, so it drives
  // project selection off the same shared switcher below rather than a
  // special case here.
  const onTrust = currentPath === '/trust';

  // Platform dropdown handlers
  const onPlatformEnter = () => {
    clearTimeout(platformTimer.current);
    setPlatformOpen(true);
  };
  const onPlatformLeave = () => {
    platformTimer.current = setTimeout(() => setPlatformOpen(false), 200);
  };

  // Project dropdown handlers
  const onProjectEnter = () => {
    clearTimeout(projectTimer.current);
    setProjectOpen(true);
  };
  const onProjectLeave = () => {
    projectTimer.current = setTimeout(() => setProjectOpen(false), 200);
  };

  const handleProjectSelect = (projectId) => {
    setCurrentProjectId(projectId);
    setProjectOpen(false);
  };

  const hasActiveProject = projects.length > 0;
  const currentProjectName = currentProjectId === ALL_PROJECTS
    ? 'All projects'
    : (projects.find((p) => String(p.id) === String(currentProjectId))?.name || 'All projects');
  // The info slide-over needs one concrete project — "All projects" has
  // nothing to show info for, so fall back to the first real project.
  const infoProjectId = currentProjectId === ALL_PROJECTS ? projects[0]?.id : currentProjectId;

  // Profile dropdown handlers
  const onProfileEnter = () => {
    clearTimeout(profileTimer.current);
    setProfileOpen(true);
  };
  const onProfileLeave = () => {
    profileTimer.current = setTimeout(() => setProfileOpen(false), 200);
  };

  const handleLogoutClick = (e) => {
    e.preventDefault();
    setProfileOpen(false);
    if (onLogout) onLogout();
    window.location.href = '/';
  };

  const displayName = getDisplayName(user);

  return (
    <header className="main-header main-header-dark">
      <div className="header-left">
        <a href={isLoggedIn ? '/dashboard' : '/'} className="header-logo-link" aria-label={isLoggedIn ? 'POMAR dashboard' : 'POMAR home'}>
          <PomarLogo variant="dark" height={28} />
        </a>
      </div>

      {isLoggedIn ? (
        /* ── Logged-in: active project name + info button (no app tabs — the
             sidebar owns app switching now) ── */
        <div className="header-center">
          {onTrust ? (
            <span className="header-project-static">POMAR Trust</span>
          ) : hasActiveProject ? (
            <div className="header-project-block">
              <div
                className="header-dropdown header-project-dropdown"
                onMouseEnter={onProjectEnter}
                onMouseLeave={onProjectLeave}
              >
                <button className="header-project-name-btn">
                  {currentProjectName} <span className="caret">▾</span>
                </button>
                {projectOpen && (
                  <div className="dropdown-menu project-dropdown-menu">
                    <button
                      className={`dropdown-item project-dropdown-item ${currentProjectId === ALL_PROJECTS ? 'active' : ''}`}
                      onClick={() => handleProjectSelect(ALL_PROJECTS)}
                    >
                      All projects
                    </button>
                    {projects.length > 0 && <div className="profile-dropdown-divider" />}
                    {projects.map((p) => (
                      <button
                        key={p.id}
                        className={`dropdown-item project-dropdown-item ${String(currentProjectId) === String(p.id) ? 'active' : ''}`}
                        onClick={() => handleProjectSelect(String(p.id))}
                      >
                        {p.name}
                      </button>
                    ))}
                    {canCreateProject && (
                      <>
                        <div className="profile-dropdown-divider" />
                        <button
                          className="project-dropdown-new-btn"
                          onClick={() => { setProjectOpen(false); setShowNewProject(true); }}
                        >
                          + New project
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>

              {currentProjectId !== ALL_PROJECTS && infoProjectId && (
                <button
                  className="header-info-btn"
                  onClick={() => setInfoOpen(true)}
                  aria-label="Project info"
                  title="Project info"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="11" x2="12" y2="16.5" />
                    <circle cx="12" cy="7.5" r="0.5" fill="currentColor" />
                  </svg>
                </button>
              )}
            </div>
          ) : (
            <span className="header-project-static header-select-project">Select a project</span>
          )}
        </div>
      ) : (
        /* ── Logged-out: marketing nav ── */
        <nav className="header-nav">
          <a href="/" className="header-link">Home</a>

          {/* Platform dropdown */}
          <div
            className="header-dropdown"
            onMouseEnter={onPlatformEnter}
            onMouseLeave={onPlatformLeave}
          >
            <button className="header-link dropdown-trigger">
              Platform <span className="caret">▾</span>
            </button>
            {platformOpen && (
              <div className="dropdown-menu">
                {PLATFORM_DROPDOWN_IDS.map((id) => {
                  const product = getProductById(id);
                  return (
                    <a key={id} href={product.marketingPath} className="dropdown-item">
                      <span className="dropdown-item-tag">Live</span>
                      <div>
                        <div className="dropdown-item-title">{product.name}</div>
                        <div className="dropdown-item-sub">{product.description}</div>
                      </div>
                    </a>
                  );
                })}
              </div>
            )}
          </div>

          <a href="/pricing" className="header-link">Pricing</a>

          <a href="/about" className="header-link">About</a>
        </nav>
      )}

      <div className="header-right">
        {showNewProject && (
          <NewProjectModal
            userId={userId}
            onClose={() => setShowNewProject(false)}
            onCreated={(project) => {
              setShowNewProject(false);
              refreshProjects(project.id);
            }}
          />
        )}

        {isLoggedIn ? (
          /* ── Identity block (initials badge + name/company) + profile dropdown ── */
          <div
            className="header-dropdown header-profile-dropdown"
            onMouseEnter={onProfileEnter}
            onMouseLeave={onProfileLeave}
          >
            <button
              className="header-user-info"
              aria-label="Open profile menu"
              aria-expanded={profileOpen}
            >
              <div className="header-user-badge">{getInitials(displayName)}</div>
              <div className="header-user-text">
                <div className="header-user-name">{displayName}</div>
                {user?.company && <div className="header-user-company">{user.company}</div>}
              </div>
            </button>

            {profileOpen && (
              <div className="dropdown-menu profile-dropdown-menu">
                {/* Name + email display */}
                <div className="profile-dropdown-identity">
                  <div className="profile-dropdown-name">{displayName || 'My Account'}</div>
                  <div className="profile-dropdown-email">{user?.email || ''}</div>
                </div>

                <div className="profile-dropdown-divider" />

                <a
                  href="/profile"
                  className="dropdown-item profile-dropdown-item"
                  onClick={() => setProfileOpen(false)}
                >
                  <span className="profile-dropdown-icon">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                      <circle cx="12" cy="7" r="4" />
                    </svg>
                  </span>
                  My Profile
                </a>

                <a
                  href="/company-settings"
                  className="dropdown-item profile-dropdown-item"
                  onClick={() => setProfileOpen(false)}
                >
                  <span className="profile-dropdown-icon">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 21h18" />
                      <path d="M5 21V7l7-4 7 4v14" />
                      <path d="M9 21v-6h6v6" />
                      <path d="M9 11h.01M15 11h.01M9 15h.01M15 15h.01" />
                    </svg>
                  </span>
                  Company Settings
                </a>

                <div className="profile-dropdown-divider" />

                <a
                  href="/about"
                  className="dropdown-item profile-dropdown-item"
                  onClick={() => setProfileOpen(false)}
                >
                  <span className="profile-dropdown-icon">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="11" x2="12" y2="16.5" />
                      <circle cx="12" cy="7.5" r="0.5" fill="currentColor" />
                    </svg>
                  </span>
                  About Us
                </a>

                <div className="profile-dropdown-divider" />

                <button
                  className="dropdown-item profile-dropdown-item profile-logout-btn"
                  onClick={handleLogoutClick}
                >
                  <span className="profile-dropdown-icon">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                      <polyline points="16 17 21 12 16 7" />
                      <line x1="21" y1="12" x2="9" y2="12" />
                    </svg>
                  </span>
                  Logout
                </button>
              </div>
            )}
          </div>
        ) : (
          <a href="/login" className="header-btn-login">Login</a>
        )}
        {!isLoggedIn && <a href="/demo" className="header-btn-book">Book a Demo</a>}
      </div>

      {infoOpen && infoProjectId && (
        <ProjectInfoSlideOver
          projectId={infoProjectId}
          projectName={currentProjectName}
          userId={userId}
          onClose={() => setInfoOpen(false)}
        />
      )}
    </header>
  );
}
