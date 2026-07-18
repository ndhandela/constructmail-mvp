import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { AddCompanyModal } from './ClientsManagement';
import CompanyFlagsSlideOver from '../components/CompanyFlagsSlideOver';
import ModuleToggleRow from '../components/ModuleToggleRow';
import { MODULE_ICONS, MODULE_DEFS, GATED_MODULE_KEYS } from '../components/moduleIcons';
import '../styles/FeatureFlagsManagement.css';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

// Resolves company-specific-then-global-then-false, mirroring
// access_control.py's get_active_modules/require_feature_flag precedence
// exactly, so a badge never shows "disabled" for a module that's actually
// reachable through a global default. Non-gated modules (e.g. Connect —
// see moduleIcons.js) have no flag row at all and are always actually
// available, so they're forced "enabled" here rather than falling through
// to the false default that a truly-missing row would otherwise produce.
function resolveEffectiveFlags(company, flagsByCompany, globalFlagsByKey) {
  const perCompany = (company && flagsByCompany[company.id]) || {};
  const result = {};
  for (const m of MODULE_DEFS) {
    const companyFlag = perCompany[m.key];
    const globalFlag = globalFlagsByKey[m.key];
    const flag = companyFlag || globalFlag;
    const enabled = !m.gated ? true : (companyFlag ? !!companyFlag.is_enabled : (globalFlag ? !!globalFlag.is_enabled : false));
    result[m.key] = { enabled, flag };
  }
  return result;
}

export default function FeatureFlagsManagement({ token, onNavigate }) {
  const [flags, setFlags] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedCompany, setSelectedCompany] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [globalRowState, setGlobalRowState] = useState({});

  const fetchFlags = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/feature-flags`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      if (data.success) setFlags(data.flags);
    } catch (err) {
      console.error('Fetch flags error:', err);
    } finally {
      setLoading(false);
    }
  }, [token]);

  const fetchCompanies = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/companies?limit=100`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      if (data.success) setCompanies(data.companies);
    } catch (err) {
      console.error('Fetch companies error:', err);
    }
  }, [token]);

  useEffect(() => {
    fetchFlags();
    fetchCompanies();
  }, [fetchFlags, fetchCompanies]);

  // Group the flat flags list into per-company and global lookup maps —
  // this is a UI reorganization, not a data model change: flags are still
  // discrete (company_id, feature_key) rows, we just stop rendering them
  // as one card each.
  const flagsByCompany = useMemo(() => {
    const map = {};
    for (const flag of flags) {
      if (flag.is_global || !flag.company_id) continue;
      if (!map[flag.company_id]) map[flag.company_id] = {};
      map[flag.company_id][flag.feature_key] = flag;
    }
    return map;
  }, [flags]);

  const globalFlagsByKey = useMemo(() => {
    const map = {};
    for (const flag of flags) {
      if (flag.is_global) map[flag.feature_key] = flag;
    }
    return map;
  }, [flags]);

  const filteredCompanies = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return companies;
    return companies.filter((c) => (c.name || '').toLowerCase().includes(q));
  }, [companies, search]);

  // Merges a just-persisted flag row into local state so both the slide-
  // over and the list-view badges update immediately, without a refetch.
  const handleFlagChanged = (updated) => {
    setFlags((prev) => {
      const idx = prev.findIndex((f) =>
        f.is_global === updated.is_global &&
        f.feature_key === updated.feature_key &&
        (updated.is_global ? true : f.company_id === updated.company_id)
      );
      if (idx === -1) return [...prev, updated];
      const next = [...prev];
      next[idx] = { ...next[idx], ...updated };
      return next;
    });
  };

  const handleGlobalToggle = async (moduleDef) => {
    const current = globalFlagsByKey[moduleDef.key];
    const nextEnabled = !current?.is_enabled;
    setGlobalRowState((prev) => ({ ...prev, [moduleDef.key]: { toggling: true, error: '' } }));
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/feature-flags`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          feature_name: current?.feature_key || moduleDef.key,
          is_global: true,
          company_id: null,
          is_enabled: nextEnabled,
        }),
      });
      const data = await res.json();
      if (data.success) {
        handleFlagChanged({
          feature_key: current?.feature_key || moduleDef.key,
          feature_name: current?.feature_name || moduleDef.label,
          module: moduleDef.key,
          is_enabled: nextEnabled,
          is_global: true,
          company_id: null,
        });
        setGlobalRowState((prev) => ({ ...prev, [moduleDef.key]: { toggling: false, error: '' } }));
      } else {
        setGlobalRowState((prev) => ({ ...prev, [moduleDef.key]: { toggling: false, error: data.detail || 'Could not update.' } }));
      }
    } catch (err) {
      console.error('Toggle global flag error:', err);
      setGlobalRowState((prev) => ({ ...prev, [moduleDef.key]: { toggling: false, error: 'Network error.' } }));
    }
  };

  const handleCompanyCreated = () => {
    setShowAddModal(false);
    fetchCompanies();
    fetchFlags();
  };

  if (loading) {
    return <div className="flags-loading">Loading feature flags...</div>;
  }

  const selectedEffectiveFlags = selectedCompany
    ? resolveEffectiveFlags(selectedCompany, flagsByCompany, globalFlagsByKey)
    : null;

  return (
    <div className="feature-flags-management">
      <div className="flags-header">
        <div className="flags-header-content">
          <div>
            <h2>Feature Flags</h2>
            <p>Manage module access per company</p>
          </div>
          <button className="back-btn" onClick={() => onNavigate('dashboard')}>
            ← Back to Dashboard
          </button>
        </div>
      </div>

      <div className="flags-page-container">
        <div className="flags-global-panel">
          <h3>Global Defaults</h3>
          <p className="flags-global-panel-sub">Fallback used when a company has no explicit override</p>
          <div className="flags-global-rows">
            {MODULE_DEFS.map((m) => {
              const state = globalRowState[m.key] || {};
              return (
                <ModuleToggleRow
                  key={m.key}
                  moduleDef={m}
                  enabled={!!globalFlagsByKey[m.key]?.is_enabled}
                  toggling={state.toggling}
                  error={state.error}
                  onToggle={() => handleGlobalToggle(m)}
                />
              );
            })}
          </div>
        </div>

        <div className="flags-companies-panel">
          <div className="flags-companies-toolbar">
            <input
              type="text"
              className="flags-search-input"
              placeholder="Search companies…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button className="add-client-btn" onClick={() => setShowAddModal(true)}>
              + Add Client
            </button>
          </div>

          {filteredCompanies.length === 0 ? (
            <div className="flags-companies-empty">
              {companies.length === 0 ? 'No companies yet.' : `No companies match "${search}".`}
            </div>
          ) : (
            <div className="flags-company-list">
              {filteredCompanies.map((company) => {
                const effective = resolveEffectiveFlags(company, flagsByCompany, globalFlagsByKey);
                const enabledCount = GATED_MODULE_KEYS.filter((k) => effective[k].enabled).length;
                return (
                  <button
                    key={company.id}
                    type="button"
                    className="flags-company-row"
                    onClick={() => setSelectedCompany(company)}
                  >
                    <div className="fcr-name-block">
                      <div className="fcr-name">{company.name || 'N/A'}</div>
                      <div className="fcr-sub">{company.owner_email || 'No owner'}</div>
                    </div>

                    <div className="fcr-badges">
                      {MODULE_DEFS.map((m) => (
                        <span
                          key={m.key}
                          className={`fcr-badge ${effective[m.key].enabled ? 'enabled' : 'disabled'} ${m.gated ? '' : 'not-gated'}`}
                          title={m.note ? `${m.label} — ${m.note}` : m.label}
                        >
                          {MODULE_ICONS[m.key]}
                        </span>
                      ))}
                    </div>

                    <div className="fcr-count">{enabledCount} / {GATED_MODULE_KEYS.length} enabled</div>

                    <span className="fcr-chevron">›</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {selectedCompany && (
        <CompanyFlagsSlideOver
          company={selectedCompany}
          effectiveFlags={selectedEffectiveFlags}
          token={token}
          onClose={() => setSelectedCompany(null)}
          onFlagChanged={handleFlagChanged}
        />
      )}

      {showAddModal && (
        <AddCompanyModal
          token={token}
          onClose={() => setShowAddModal(false)}
          onCreated={handleCompanyCreated}
        />
      )}
    </div>
  );
}
