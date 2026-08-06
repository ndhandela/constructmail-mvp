import React, { useContext, useState } from 'react';
import { ProjectContext } from '../contexts/ProjectContext';
import { useUnsavedChanges } from '../contexts/UnsavedChangesContext';
import { ICONS, PROJECT_SCOPED_ITEMS, ACCOUNT_LEVEL_ITEMS } from './Sidebar';
import '../styles/BottomNav.css';

// Mobile-only bottom tab bar (hidden ≥768px via CSS — see BottomNav.css).
// Primary tabs are the 4 modules used most on-site per stakeholder input;
// everything else in the sidebar (plus Profile/Company Settings/Logout,
// which the mobile header hides entirely — see the `.header-user-info
// { display:none }` mobile rule in Header.css) lives behind "More".
const PRIMARY_ITEMS = [
  { key: 'home', path: '/dashboard', label: 'Home' },
  { key: 'documents', path: '/documents', label: 'Documents' },
  { key: 'capital', path: '/capital', label: 'Capital' },
  { key: 'invoice_tracker', path: '/invoices', label: 'Invoices' },
];

const PRIMARY_KEYS = new Set(PRIMARY_ITEMS.map((i) => i.key));

function NavButton({ item, active, disabled, onNavigate }) {
  return (
    <button
      type="button"
      className={`bottom-nav-item ${active ? 'active' : ''}`}
      onClick={() => !disabled && onNavigate(item.path)}
      disabled={disabled}
      aria-current={active ? 'page' : undefined}
    >
      <span className="bottom-nav-icon">{ICONS[item.key]}</span>
      <span className="bottom-nav-label">{item.label}</span>
    </button>
  );
}

export default function BottomNav({ user, onLogout }) {
  const { projects } = useContext(ProjectContext);
  const { guardNavigation } = useUnsavedChanges();
  const [moreOpen, setMoreOpen] = useState(false);

  const currentPath = window.location.pathname;
  const hasActiveProject = projects.length > 0;
  const showTrust = user?.company_region === 'IN' && user?.active_modules?.trust;
  const restrictedModule = user?.restricted_module || null;

  const navigate = (path) => {
    setMoreOpen(false);
    guardNavigation(() => { window.location.href = path; });
  };

  const handleLogout = () => {
    setMoreOpen(false);
    if (onLogout) onLogout();
    window.location.href = '/';
  };

  const moreProjectItems = PROJECT_SCOPED_ITEMS.filter((item) => !restrictedModule);
  const moreAccountItems = ACCOUNT_LEVEL_ITEMS
    .filter((item) => !PRIMARY_KEYS.has(item.key))
    .filter((item) => item.key !== 'trust' || showTrust)
    .filter((item) => !restrictedModule || item.key === restrictedModule);

  const isMoreActive = !PRIMARY_ITEMS.some((i) => i.path === currentPath) &&
    ([...moreProjectItems, ...moreAccountItems].some((i) => i.path === currentPath) ||
      ['/profile', '/company-settings'].includes(currentPath));

  return (
    <>
      <nav className="bottom-nav" aria-label="Primary">
        {PRIMARY_ITEMS.map((item) => (
          <NavButton
            key={item.key}
            item={item}
            active={currentPath === item.path}
            disabled={false}
            onNavigate={navigate}
          />
        ))}
        <button
          type="button"
          className={`bottom-nav-item ${isMoreActive ? 'active' : ''}`}
          onClick={() => setMoreOpen(true)}
          aria-haspopup="true"
          aria-expanded={moreOpen}
        >
          <span className="bottom-nav-icon">{ICONS.more}</span>
          <span className="bottom-nav-label">More</span>
        </button>
      </nav>

      {moreOpen && (
        <div className="bottom-nav-sheet-overlay" onClick={() => setMoreOpen(false)}>
          <div className="bottom-nav-sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="More">
            <div className="bottom-nav-sheet-handle" />

            {moreProjectItems.length > 0 && (
              <div className="bottom-nav-sheet-group">
                {moreProjectItems.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    className={`bottom-nav-sheet-item ${currentPath === item.path ? 'active' : ''} ${!hasActiveProject ? 'disabled' : ''}`}
                    onClick={() => hasActiveProject && navigate(item.path)}
                    disabled={!hasActiveProject}
                  >
                    <span className="bottom-nav-sheet-icon">{ICONS[item.key]}</span>
                    {item.label}
                  </button>
                ))}
              </div>
            )}

            {moreAccountItems.length > 0 && (
              <div className="bottom-nav-sheet-group">
                {moreAccountItems.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    className={`bottom-nav-sheet-item ${currentPath === item.path ? 'active' : ''}`}
                    onClick={() => navigate(item.path)}
                  >
                    <span className="bottom-nav-sheet-icon">{ICONS[item.key]}</span>
                    {item.label}
                  </button>
                ))}
              </div>
            )}

            <div className="bottom-nav-sheet-group">
              <button type="button" className="bottom-nav-sheet-item" onClick={() => navigate('/profile')}>
                <span className="bottom-nav-sheet-icon">{ICONS.profile}</span>
                My Profile
              </button>
              <button type="button" className="bottom-nav-sheet-item" onClick={() => navigate('/company-settings')}>
                <span className="bottom-nav-sheet-icon">{ICONS.company_settings}</span>
                Company Settings
              </button>
              <button type="button" className="bottom-nav-sheet-item bottom-nav-sheet-logout" onClick={handleLogout}>
                <span className="bottom-nav-sheet-icon">{ICONS.logout}</span>
                Logout
              </button>
            </div>

            <button type="button" className="bottom-nav-sheet-close" onClick={() => setMoreOpen(false)}>
              Close
            </button>
          </div>
        </div>
      )}
    </>
  );
}
