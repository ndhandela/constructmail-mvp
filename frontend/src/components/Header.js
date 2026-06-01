import React, { useState, useRef } from 'react';
import PomarLogo from './PomarLogo';
import '../styles/Header.css';

function getInitials(user) {
  if (!user) return '?';
  const name = user.first_name && user.last_name
    ? `${user.first_name} ${user.last_name}`
    : user.full_name || user.name || '';
  if (name.trim()) {
    return name.trim().split(/\s+/).map(p => p[0]).slice(0, 2).join('').toUpperCase();
  }
  return (user.email || '?')[0].toUpperCase();
}

function getDisplayName(user) {
  if (!user) return '';
  if (user.first_name || user.last_name) {
    return `${user.first_name || ''} ${user.last_name || ''}`.trim();
  }
  return user.full_name || user.name || user.email || '';
}

export default function Header({ userId, onLogout, user }) {
  const [platformOpen, setPlatformOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  const platformTimer = useRef(null);
  const profileTimer  = useRef(null);

  // Platform dropdown handlers
  const onPlatformEnter = () => {
    clearTimeout(platformTimer.current);
    setPlatformOpen(true);
  };
  const onPlatformLeave = () => {
    platformTimer.current = setTimeout(() => setPlatformOpen(false), 200);
  };

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

  const initials    = getInitials(user);
  const displayName = getDisplayName(user);

  return (
    <header className="main-header">
      <div className="header-left">
        <a href="/" className="header-logo-link" aria-label="POMAR home">
          <PomarLogo variant="light" height={32} />
        </a>
      </div>

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
              {userId && (
                <a href="/marketplace" className="dropdown-item">
                  <span className="dropdown-item-tag">Live</span>
                  <div>
                    <div className="dropdown-item-title">POMAR Marketplace <span className="dropdown-item-lock">🔒</span></div>
                    <div className="dropdown-item-sub">Shared vendor network</div>
                  </div>
                </a>
              )}
            </div>
          )}
        </div>

        <a href="/about" className="header-link">About</a>
      </nav>

      <div className="header-right">
        {userId ? (
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
                : <span className="header-avatar-initials">{initials}</span>
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
        <a href="/contact" className="header-btn-book">Book a Demo</a>
      </div>
    </header>
  );
}
