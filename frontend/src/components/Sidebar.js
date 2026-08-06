import React, { useContext } from 'react';
import { ProjectContext } from '../contexts/ProjectContext';
import { useUnsavedChanges } from '../contexts/UnsavedChangesContext';
import '../styles/Sidebar.css';

// 2px stroke, round caps/joins — matches the icon spec across the app.
const ICONS = {
  home: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  ),
  more: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="5" cy="12" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  ),
  profile: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  ),
  company_settings: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 21h18" />
      <path d="M5 21V7l7-4 7 4v14" />
      <path d="M9 21v-6h6v6" />
    </svg>
  ),
  logout: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  ),
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
  daily_logs: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  ),
  invoice_tracker: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 2h9a2 2 0 0 1 2 2v16l-3-2-3 2-3-2-3 2V4a2 2 0 0 1 2-2z" />
      <line x1="8" y1="7" x2="16" y2="7" />
      <line x1="8" y1="11" x2="16" y2="11" />
      <line x1="8" y1="15" x2="12" y2="15" />
    </svg>
  ),
  documents: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="13 2 13 8 19 8" />
    </svg>
  ),
};

export const PROJECT_SCOPED_ITEMS = [
  { key: 'mail', path: '/mail', label: 'Mail' },
  { key: 'clash', path: '/clash', label: 'Clash' },
  { key: 'vendors', path: '/vendors', label: 'Vendors' },
  { key: 'connect', path: '/connect', label: 'Connect' },
];

export const ACCOUNT_LEVEL_ITEMS = [
  { key: 'marketplace', path: '/marketplace', label: 'Marketplace' },
  { key: 'trust', path: '/trust', label: 'Trust' },
  { key: 'capital', path: '/capital', label: 'Capital Tracker' },
  { key: 'daily_logs', path: '/daily-logs', label: 'Daily Logs' },
  { key: 'invoice_tracker', path: '/invoices', label: 'Invoice Tracker' },
  { key: 'documents', path: '/documents', label: 'Documents' },
];

export { ICONS };

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

  // A team member scoped to one module (users.restricted_module — see
  // services/access_control.py) gets a sidebar that shows only that
  // module: every other entry 403s server-side anyway, so hiding them
  // here isn't the real enforcement, just matching the UI to it (same
  // "server side enforces, client side just reflects" split as
  // ModuleLockedNotice/isModuleLocked elsewhere in this file).
  const restrictedModule = user?.restricted_module || null;

  return (
    <aside className="app-sidebar">
      <nav className="sidebar-group">
        {PROJECT_SCOPED_ITEMS
          .filter((item) => !restrictedModule)
          .map((item) => (
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
          .filter((item) => !restrictedModule || item.key === restrictedModule)
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
