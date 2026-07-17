import React, { useState, useEffect, useCallback } from 'react';
import ModuleLockedNotice, { isModuleLocked } from '../../../components/ModuleLockedNotice';
import TrustDashboard from './TrustDashboard';
import TrustQPRGenerator from './TrustQPRGenerator';
import TrustChangeAlerts from './TrustChangeAlerts';
import TrustAuditTrail from './TrustAuditTrail';
import { API_BASE_URL, getTrustRole } from '../trustUtils';
import '../styles/TrustApp.css';

const TABS = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'qpr', label: 'QPR Generator' },
  { key: 'alerts', label: 'Change Alerts' },
  { key: 'audit', label: 'Audit Trail' },
];

export default function TrustApp({ user, userId }) {
  // A US-region company should never see Trust content even if someone
  // manually flips the 'trust' feature flag on for it — region is checked
  // client-side too, not just isModuleLocked's flag check (server enforces
  // both regardless, see services/trust_access.py).
  const trustLocked = user?.company_region !== 'IN' || isModuleLocked(user?.active_modules, 'trust');

  const [activeTab, setActiveTab] = useState('dashboard');
  const [projects, setProjects] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [stateProfiles, setStateProfiles] = useState([]);
  const trustRole = getTrustRole(user);
  // Only orgs with something else to link to need the mode picker at all —
  // an India-only Trust-only org has no generic projects to offer, so the
  // form just stays the plain standalone one for them.
  const canLinkProjects = !!(user?.active_modules?.vendors || user?.active_modules?.clash || user?.active_modules?.mail);

  const fetchProjects = useCallback(async () => {
    setLoadingProjects(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/trust/projects?userId=${userId}`);
      const data = await res.json();
      if (data.success) {
        setProjects(data.projects || []);
        setSelectedProjectId((prev) => prev || (data.projects[0] && data.projects[0].id));
      }
    } catch (err) {
      console.error('Fetch trust projects error:', err);
    } finally {
      setLoadingProjects(false);
    }
  }, [userId]);

  useEffect(() => {
    if (!trustLocked && userId) fetchProjects();
  }, [trustLocked, userId, fetchProjects]);

  useEffect(() => {
    if (trustLocked || !userId) return;
    fetch(`${API_BASE_URL}/api/trust/state-profiles?userId=${userId}`)
      .then((res) => res.json())
      .then((data) => { if (data.success) setStateProfiles(data.states || []); })
      .catch((err) => console.error('Fetch state profiles error:', err));
  }, [trustLocked, userId]);

  if (trustLocked) {
    return (
      <div className="trust-app">
        <ModuleLockedNotice moduleName="POMAR Trust" companyName={user?.company} />
      </div>
    );
  }

  const selectedProject = projects.find((p) => p.id === selectedProjectId) || null;

  return (
    <div className="trust-app">
      <div className="trust-hero">
        <div className="trust-badge">POMAR TRUST · RERA COMPLIANCE</div>
        <h1>Stay ahead of RERA filings and buyer disclosures</h1>
        <p>Turn site-engineer WhatsApp and email updates into QPR drafts and buyer-disclosure notices — automatically flagged, never auto-sent.</p>
      </div>

      <div className="trust-container">
        <div className="trust-toolbar">
          <div className="trust-project-picker">
            <label>Project</label>
            <select
              value={selectedProjectId || ''}
              onChange={(e) => setSelectedProjectId(Number(e.target.value))}
              disabled={loadingProjects || projects.length === 0}
            >
              {projects.length === 0 && <option value="">No projects yet</option>}
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.project_name}</option>
              ))}
            </select>
          </div>

          <div className="trust-tabs">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                className={`trust-tab ${activeTab === tab.key ? 'active' : ''}`}
                onClick={() => setActiveTab(tab.key)}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {activeTab === 'dashboard' && (
          <TrustDashboard
            userId={userId}
            projects={projects}
            loadingProjects={loadingProjects}
            trustRole={trustRole}
            stateProfiles={stateProfiles}
            canLinkProjects={canLinkProjects}
            onProjectCreated={fetchProjects}
            onSelectProject={(id) => { setSelectedProjectId(id); setActiveTab('qpr'); }}
          />
        )}
        {activeTab === 'qpr' && (
          <TrustQPRGenerator userId={userId} project={selectedProject} trustRole={trustRole} stateProfiles={stateProfiles} />
        )}
        {activeTab === 'alerts' && (
          <TrustChangeAlerts userId={userId} project={selectedProject} trustRole={trustRole} />
        )}
        {activeTab === 'audit' && (
          <TrustAuditTrail userId={userId} project={selectedProject} />
        )}
      </div>
    </div>
  );
}
