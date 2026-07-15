import React, { useState, useRef, useContext } from 'react';
import PomarLogo from './PomarLogo';
import NewProjectModal from './NewProjectModal';
import { ProjectContext, ALL_PROJECTS } from '../contexts/ProjectContext';
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

// Product nav shown to logged-in users. All four are reachable regardless of
// plan — unlicensed modules (e.g. Marketplace) render their own upgrade/lock
// prompt rather than being hidden from nav, matching the dashboard's pattern.
const PRODUCT_NAV = [
  { path: '/constructmail', label: 'Mail' },
  { path: '/clash',         label: 'Clash' },
  { path: '/vendors',       label: 'Vendors' },
  { path: '/marketplace',   label: 'Marketplace' },
];

export default function Header({ userId, onLogout, user }) {
  const isLoggedIn = !!userId;

  const [platformOpen, setPlatformOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [projectOpen, setProjectOpen] = useState(false);
  const [showNewProject, setShowNewProject] = useState(false);

  const platformTimer = useRef(null);
  const profileTimer  = useRef(null);
  const projectTimer  = useRef(null);

  const { projects, currentProjectId, setCurrentProjectId, refreshProjects } = useContext(ProjectContext);
  const canCreateProject = PROJECT_CREATOR_ROLES.includes(user?.role);

  const currentPath = window.location.pathname;

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

  const currentProjectName = currentProjectId === ALL_PROJECTS
    ? 'All projects'
    : (projects.find((p) => String(p.id) === String(currentProjectId))?.name || 'All projects');

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
    <header className="main-header">
      <div className="header-left">
        <a href={isLoggedIn ? '/dashboard' : '/'} className="header-logo-link" aria-label={isLoggedIn ? 'POMAR dashboard' : 'POMAR home'}>
          <PomarLogo variant="light" height={32} />
        </a>
      </div>

      {isLoggedIn ? (
        /* ── Logged-in: product nav ── */
        <nav className="header-nav">
          {PRODUCT_NAV.map((item) => (
            <a
              key={item.path}
              href={item.path}
              className={`header-link ${currentPath === item.path ? 'active' : ''}`}
            >
              {item.label}
            </a>
          ))}
        </nav>
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
                <a href="/constructmail" className="dropdown-item">
                  <span className="dropdown-item-tag">Live</span>
                  <div>
                    <div className="dropdown-item-title">POMAR Mail <span className="dropdown-item-lock">🔒</span></div>
                    <div className="dropdown-item-sub">POMAR Mail</div>
                  </div>
                </a>
                <a href="/clash" className="dropdown-item">
                  <span className="dropdown-item-tag">Live</span>
                  <div>
                    <div className="dropdown-item-title">POMAR Clash <span className="dropdown-item-lock">🔒</span></div>
                    <div className="dropdown-item-sub">BIM Clash Report Analyzer</div>
                  </div>
                </a>
                <a href="/vendors" className="dropdown-item">
                  <span className="dropdown-item-tag">Live</span>
                  <div>
                    <div className="dropdown-item-title">POMAR Vendors <span className="dropdown-item-lock">🔒</span></div>
                    <div className="dropdown-item-sub">Find trusted contractors</div>
                  </div>
                </a>
              </div>
            )}
          </div>

          <a href="/pricing" className="header-link">Pricing</a>

          <a href="/about" className="header-link">About</a>
        </nav>
      )}

      <div className="header-right">
        {isLoggedIn && (
          /* ── Project switcher ── */
          <div
            className="header-dropdown header-project-dropdown"
            onMouseEnter={onProjectEnter}
            onMouseLeave={onProjectLeave}
          >
            <button className="header-link dropdown-trigger project-switcher-btn">
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
        )}

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
          /* ── Profile avatar + dropdown ── */
          <div
            className="header-dropdown header-profile-dropdown"
            onMouseEnter={onProfileEnter}
            onMouseLeave={onProfileLeave}
          >
            <button
              className="header-avatar-btn"
              aria-label="Open profile menu"
              aria-expanded={profileOpen}
            >
              {user?.avatar_url
                ? <img src={user.avatar_url} alt={displayName} className="header-avatar-img" />
                : (
                  <svg className="header-avatar-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="12" cy="8" r="4" fill="white"/>
                    <path d="M4 20c0-4 3.582-7 8-7s8 3 8 7" stroke="white" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                )
              }
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
                  <span className="profile-dropdown-icon">👤</span>
                  My Profile
                </a>

                <div className="profile-dropdown-divider" />

                <a
                  href="/about"
                  className="dropdown-item profile-dropdown-item"
                  onClick={() => setProfileOpen(false)}
                >
                  <span className="profile-dropdown-icon">ℹ️</span>
                  About Us
                </a>

                <div className="profile-dropdown-divider" />

                <button
                  className="dropdown-item profile-dropdown-item profile-logout-btn"
                  onClick={handleLogoutClick}
                >
                  <span className="profile-dropdown-icon">→</span>
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
    </header>
  );
}
