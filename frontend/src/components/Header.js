import React, { useState, useRef, useContext } from 'react';
import PomarLogo from './PomarLogo';
import NewProjectModal from './NewProjectModal';
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

// Product nav shown to logged-in users. All four are reachable regardless of
// plan — unlicensed modules (e.g. Marketplace) render their own upgrade/lock
// prompt rather than being hidden from nav, matching the dashboard's pattern.
const PRODUCT_NAV = [
  { path: '/mail',          label: 'Mail' },
  { path: '/clash',         label: 'Clash' },
  { path: '/vendors',       label: 'Vendors' },
  { path: '/marketplace',   label: 'Marketplace' },
];

// Platform dropdown shown to logged-out visitors — links to public marketing
// pages (product.marketingPath), never to the authenticated app routes above.
const PLATFORM_DROPDOWN_IDS = ['constructmail', 'clash', 'vendors', 'marketplace'];

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
