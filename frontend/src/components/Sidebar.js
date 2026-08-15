import React, { useContext, useEffect, useState } from 'react';
import { ProjectContext, ALL_PROJECTS } from '../contexts/ProjectContext';
import { useUnsavedChanges } from '../contexts/UnsavedChangesContext';
import '../styles/Sidebar.css';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

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
  permits: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="8" y="2" width="8" height="4" rx="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <path d="m9 14 2 2 4-4" />
    </svg>
  ),
  tasks: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="6" height="6" rx="1" />
      <path d="m4.5 8 1 1 2-2" />
      <line x1="12" y1="8" x2="21" y2="8" />
      <rect x="3" y="15" width="6" height="6" rx="1" />
      <line x1="12" y1="18" x2="21" y2="18" />
    </svg>
  ),
  dashboard: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="9" rx="1" />
      <rect x="14" y="3" width="7" height="5" rx="1" />
      <rect x="14" y="12" width="7" height="9" rx="1" />
      <rect x="3" y="16" width="7" height="5" rx="1" />
    </svg>
  ),
  project: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  ),
  schedule: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  ),
  work_items: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m9 11 3 3L22 4" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
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
  { key: 'invoice_tracker', path: '/invoices', label: 'Invoices' },
  { key: 'documents', path: '/documents', label: 'Documents' },
  { key: 'permits', path: '/permits', label: 'Permits' },
  { key: 'tasks', path: '/tasks', label: 'Tasks' },
];

// The only modules a lead account (account_status === 'lead' — a
// project-vendor sub, or an accountant/marketplace lead) can actually reach:
// Daily Logs via a per-project services/vendor_access.py grant, Documents,
// Permits, and Tasks via their own independent GC/Sub sharing model
// (services/document_helpers.py / services/permit_helpers.py /
// services/task_helpers.py). Every other module goes through
// services/access_control.require_feature_flag, which unconditionally
// 403s any account_status='lead' user before it even looks at
// company_id — so those stay hidden for leads.
const LEAD_ACCESSIBLE_MODULE_KEYS = ['daily_logs', 'documents', 'permits', 'tasks'];

// ── New 3-tier nav (behind the 'new_nav' feature flag) ─────────────────────
// Tier 1: fixed core (always present, not user-configurable).
const CORE_ITEMS = [
  { key: 'dashboard', path: '/projects-overview', label: 'Dashboard' },
  { key: 'project', path: '/project', label: 'Project' },
];

// Tier 2: fixed global cross-project tools — same modules regardless of
// which project is selected. Explicitly not POMAR Vendors' project-scoped
// cousin (Project - Subs), see modules/project-subs.
const GLOBAL_TOOL_ITEMS = [
  { key: 'vendors', path: '/vendors', label: 'Vendors' },
  { key: 'mail', path: '/mail', label: 'Mail' },
  { key: 'clash', path: '/clash', label: 'Clash' },
  { key: 'marketplace', path: '/marketplace', label: 'Marketplace' },
];

// Tier 3: user-pinned favorites (frontend/src/modules/project-hub — pinned
// via ProjectDetailPage.js's pin icon, persisted in user_pinned_apps).
// Budget/Schedule/Project-Subs have no standalone route, so they deep-link
// into Project Detail's inline views via ?view=; Invoices/Daily
// logs/Documents already have full pages that read the selected project
// from the same shared ProjectContext.
export const PINNED_APP_CONFIG = {
  work_items: { icon: 'work_items', label: 'Work Items', path: '/work-items' },
  budget: { icon: 'capital', label: 'Budget', path: '/project?view=budget' },
  schedule: { icon: 'schedule', label: 'Schedule', path: '/project?view=schedule' },
  invoices: { icon: 'invoice_tracker', label: 'Invoices', path: '/invoices' },
  daily_logs: { icon: 'daily_logs', label: 'Daily Logs', path: '/daily-logs' },
  project_subs: { icon: 'vendors', label: 'Project - Subs', path: '/project?view=project-subs' },
  documents: { icon: 'documents', label: 'Documents', path: '/documents' },
  permits: { icon: 'permits', label: 'Permits', path: '/permits' },
  tasks: { icon: 'tasks', label: 'Tasks', path: '/tasks' },
};

export { ICONS };

// item.path may carry a `?view=` query (pinned Budget/Schedule/Project-Subs
// deep-link into Project Detail's inline views) — matches on pathname plus
// that one param, ignoring any other query noise. Items without a query
// behave exactly like a plain pathname compare (same as before this
// supported query-aware matching at all).
function isItemActive(itemPath, currentPath, currentSearch) {
  const qIndex = itemPath.indexOf('?');
  const itemPathname = qIndex === -1 ? itemPath : itemPath.slice(0, qIndex);
  if (itemPathname !== currentPath) return false;
  if (qIndex === -1) return true;
  const itemView = new URLSearchParams(itemPath.slice(qIndex)).get('view');
  const currentView = new URLSearchParams(currentSearch).get('view');
  return itemView === currentView;
}

function SidebarItem({ item, active, disabled, icon, onClick }) {
  const { guardNavigation } = useUnsavedChanges();

  const handleClick = () => {
    if (disabled) return;
    if (onClick) { onClick(); return; }
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
      <span className="sidebar-item-icon">{ICONS[icon || item.key]}</span>
      <span className="sidebar-item-label">{item.label}</span>
    </button>
  );
}

function LegacySidebar({ user }) {
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

  // Lead accounts (account_status === 'lead' — marketplace signups,
  // project-vendor invites, accountant invites) have no restricted_module
  // set, but require_feature_flag blanket-403s them out of every one of
  // these modules just the same (see services/access_control.py). Daily
  // Logs is deliberately NOT excluded here even though a project-vendor
  // lead's real access to it comes through a separate per-project grant
  // (services/vendor_access.py) rather than this sidebar's module list —
  // that grant is project-scoped and only meaningful once a project is
  // selected, so it doesn't belong in an always-visible nav item anyway.
  const isLeadAccount = user?.account_status === 'lead';

  return (
    <aside className="app-sidebar">
      <nav className="sidebar-group">
        {PROJECT_SCOPED_ITEMS
          .filter((item) => !restrictedModule && !isLeadAccount)
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
          .filter((item) => !isLeadAccount || LEAD_ACCESSIBLE_MODULE_KEYS.includes(item.key))
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

function NewSidebar({ user }) {
  const { projects, currentProjectId, lastProjectId, setCurrentProjectId } = useContext(ProjectContext);
  const { guardNavigation } = useUnsavedChanges();
  const currentPath = window.location.pathname;
  const currentSearch = window.location.search;
  const hasActiveProject = projects.length > 0;
  const restrictedModule = user?.restricted_module || null;
  // See LegacySidebar above for why lead accounts are hidden the same way
  // restrictedModule is.
  const isLeadAccount = user?.account_status === 'lead';

  const [pinnedApps, setPinnedApps] = useState([]);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    fetch(`${API_BASE_URL}/api/user-preferences/pinned-apps?userId=${user.id}`)
      .then((res) => res.json())
      .then((data) => { if (!cancelled && data.success) setPinnedApps(data.pinnedApps || []); })
      .catch((err) => console.error('Fetch pinned apps error:', err));
    return () => { cancelled = true; };
  }, [user?.id]);

  // "Project" never dead-ends into Project Detail's "select a project"
  // fallback: if the header switcher is on the ALL_PROJECTS sentinel, fall
  // back to whichever specific project was last viewed (or the first
  // project, if this is the very first visit and nothing's been viewed
  // yet) before navigating.
  const goToProject = () => {
    let target = currentProjectId !== ALL_PROJECTS ? currentProjectId : lastProjectId;
    if (!target && projects.length > 0) target = String(projects[0].id);
    if (target && target !== currentProjectId) setCurrentProjectId(target);
    guardNavigation(() => { window.location.href = '/project'; });
  };

  return (
    <aside className="app-sidebar">
      <nav className="sidebar-group">
        {CORE_ITEMS.map((item) => (
          <SidebarItem
            key={item.key}
            item={item}
            active={isItemActive(item.path, currentPath, currentSearch)}
            disabled={false}
            onClick={item.key === 'project' ? goToProject : undefined}
          />
        ))}
      </nav>

      <div className="sidebar-divider" />

      <nav className="sidebar-group">
        {GLOBAL_TOOL_ITEMS
          .filter((item) => !restrictedModule && !isLeadAccount)
          .map((item) => (
            <SidebarItem
              key={item.key}
              item={item}
              active={isItemActive(item.path, currentPath, currentSearch)}
              disabled={!hasActiveProject}
            />
          ))}
      </nav>

      {pinnedApps.length > 0 && !restrictedModule && (
        <>
          <div className="sidebar-divider" />
          <nav className="sidebar-group">
            {pinnedApps
              .filter((appKey) => PINNED_APP_CONFIG[appKey])
              .filter((appKey) => !isLeadAccount || LEAD_ACCESSIBLE_MODULE_KEYS.includes(appKey))
              .map((appKey) => {
                const config = PINNED_APP_CONFIG[appKey];
                const item = { key: appKey, path: config.path, label: config.label };
                return (
                  <SidebarItem
                    key={appKey}
                    item={item}
                    icon={config.icon}
                    active={isItemActive(item.path, currentPath, currentSearch)}
                    disabled={!hasActiveProject}
                  />
                );
              })}
          </nav>
        </>
      )}
    </aside>
  );
}

export default function Sidebar({ user }) {
  return user?.new_nav_enabled ? <NewSidebar user={user} /> : <LegacySidebar user={user} />;
}
