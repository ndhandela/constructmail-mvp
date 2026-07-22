import React, { useContext } from 'react';
import { ProjectContext } from '../contexts/ProjectContext';
import { useUnsavedChanges } from '../contexts/UnsavedChangesContext';
import '../styles/Sidebar.css';

// 2px stroke, round caps/joins — matches the icon spec across the app.
const ICONS = {
  mail: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </svg>
  ),
  clash: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 20h20" />
      <path d="M5 20V8l7-6 7 6v12" />
      <path d="M9 20v-6h6v6" />
      <path d="M9 14h6" />
    </svg>
  ),
  vendors: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  connect: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  ),
  marketplace: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3h18l-1.5 9h-15z" />
      <circle cx="9" cy="20" r="1.5" />
      <circle cx="17" cy="20" r="1.5" />
      <path d="M5.5 12 5 3" />
    </svg>
  ),
  trust: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2 4 5v6c0 5 3.5 8.5 8 11 4.5-2.5 8-6 8-11V5z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  ),
  capital: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="1" x2="12" y2="23" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  ),
};

const PROJECT_SCOPED_ITEMS = [
  { key: 'mail', path: '/mail', label: 'Mail' },
  { key: 'clash', path: '/clash', label: 'Clash' },
  { key: 'vendors', path: '/vendors', label: 'Vendors' },
  { key: 'connect', path: '/connect', label: 'Connect' },
];

const ACCOUNT_LEVEL_ITEMS = [
  { key: 'marketplace', path: '/marketplace', label: 'Marketplace' },
  { key: 'trust', path: '/trust', label: 'Trust' },
  { key: 'capital', path: '/capital', label: 'Capital Tracker' },
];

function SidebarItem({ item, active, disabled }) {
  const { guardNavigation } = useUnsavedChanges();

  const handleClick = () => {
    if (disabled) return;
    guardNavigation(() => { window.location.href = item.path; });
  };

  return (
    <button
      className={`sidebar-item ${active ? 'active' : ''} ${disabled ? 'disabled' : ''}`}
      onClick={handleClick}
      disabled={disabled}
      aria-current={active ? 'page' : undefined}
      title={disabled ? `${item.label} — select a project first` : item.label}
    >
      <span className="sidebar-item-icon">{ICONS[item.key]}</span>
      <span className="sidebar-item-label">{item.label}</span>
    </button>
  );
}

export default function Sidebar({ user }) {
  const { projects } = useContext(ProjectContext);
  const currentPath = window.location.pathname;
  const hasActiveProject = projects.length > 0;

  const showTrust = user?.company_region === 'IN' && user?.active_modules?.trust;

  return (
    <aside className="app-sidebar">
      <nav className="sidebar-group">
        {PROJECT_SCOPED_ITEMS.map((item) => (
          <SidebarItem
            key={item.key}
            item={item}
            active={currentPath === item.path}
            disabled={!hasActiveProject}
          />
        ))}
      </nav>

      <div className="sidebar-divider" />

      <nav className="sidebar-group">
        {ACCOUNT_LEVEL_ITEMS
          .filter((item) => item.key !== 'trust' || showTrust)
          .map((item) => (
            <SidebarItem
              key={item.key}
              item={item}
              active={currentPath === item.path}
              disabled={false}
            />
          ))}
      </nav>
    </aside>
  );
}
