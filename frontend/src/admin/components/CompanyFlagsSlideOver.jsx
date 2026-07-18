import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import ModuleToggleRow from './ModuleToggleRow';
import { MODULE_DEFS } from './moduleIcons';
import '../styles/CompanyFlagsSlideOver.css';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

// Company-detail slide-over for the redesigned Feature Flags admin page.
// Same visual/interaction pattern as components/ProjectInfoSlideOver.js
// (right-side panel, overlay, Escape-to-close, portal into document.body)
// but this is a fresh component rather than a reuse of that one — the
// project slide-over is tightly coupled to ProjectContext/project fields
// and isn't a generic shell.
export default function CompanyFlagsSlideOver({ company, effectiveFlags, token, onClose, onFlagChanged }) {
  const [search, setSearch] = useState('');
  const [rowState, setRowState] = useState({});

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const filteredModules = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return MODULE_DEFS;
    return MODULE_DEFS.filter((m) => m.label.toLowerCase().includes(q));
  }, [search]);

  const handleToggle = async (moduleDef) => {
    const current = effectiveFlags[moduleDef.key];
    const nextEnabled = !current?.enabled;
    setRowState((prev) => ({ ...prev, [moduleDef.key]: { toggling: true, error: '' } }));
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/feature-flags`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          // Company-specific flags are keyed on feature_key === module key
          // here (matches the seeding in POST /api/admin/companies) —
          // upserts on (company_id, feature_key).
          feature_name: current?.flag?.feature_key || moduleDef.key,
          is_global: false,
          company_id: company.id,
          is_enabled: nextEnabled,
        }),
      });
      const data = await res.json();
      if (data.success) {
        onFlagChanged({
          feature_key: current?.flag?.feature_key || moduleDef.key,
          feature_name: current?.flag?.feature_name || moduleDef.label,
          module: moduleDef.key,
          is_enabled: nextEnabled,
          is_global: false,
          company_id: company.id,
          company_name: company.name,
        });
        setRowState((prev) => ({ ...prev, [moduleDef.key]: { toggling: false, error: '' } }));
      } else {
        setRowState((prev) => ({ ...prev, [moduleDef.key]: { toggling: false, error: data.detail || 'Could not update.' } }));
      }
    } catch (err) {
      console.error('Toggle company flag error:', err);
      setRowState((prev) => ({ ...prev, [moduleDef.key]: { toggling: false, error: 'Network error.' } }));
    }
  };

  return createPortal(
    <>
      <div className="cfso-overlay" onClick={onClose} />
      <aside className="cfso-panel" role="dialog" aria-modal="true" aria-label="Company module access">
        <div className="cfso-header">
          <div>
            <p className="cfso-eyebrow">{company.name}</p>
            <h3 className="cfso-title">Manage module access for this company</h3>
          </div>
          <button className="cfso-close-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="cfso-search">
          <input
            type="text"
            placeholder="Search modules…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="cfso-body">
          {filteredModules.length === 0 ? (
            <p className="cfso-empty">No modules match "{search}".</p>
          ) : (
            filteredModules.map((moduleDef) => {
              const state = rowState[moduleDef.key] || {};
              return (
                <ModuleToggleRow
                  key={moduleDef.key}
                  moduleDef={moduleDef}
                  enabled={!!effectiveFlags[moduleDef.key]?.enabled}
                  toggling={state.toggling}
                  error={state.error}
                  onToggle={() => handleToggle(moduleDef)}
                />
              );
            })
          )}
        </div>
      </aside>
    </>,
    document.body
  );
}
