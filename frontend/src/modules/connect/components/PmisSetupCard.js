import React, { useState, useEffect, useCallback, useContext } from 'react';
import { ProjectContext, ALL_PROJECTS } from '../../../contexts/ProjectContext';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

/**
 * PMIS connection + project-mapping settings, surfaced directly on the
 * Connect page so setup doesn't require going through Clash's RFI modal.
 * Reads and writes the same procore_tokens / project_procore_links state
 * as Clash's ProcoreConnect — one setup, honored by every push.
 */
export default function PmisSetupCard({ userId }) {
  const { currentProjectId, projects: pomarProjects } = useContext(ProjectContext);
  const hasActiveProject = currentProjectId && currentProjectId !== ALL_PROJECTS;

  const [checking, setChecking] = useState(true);
  const [connected, setConnected] = useState(false);
  const [procoreProjects, setProcoreProjects] = useState([]);
  const [linkedProjectId, setLinkedProjectId] = useState(null);
  const [changing, setChanging] = useState(false);
  const [error, setError] = useState('');

  const uid = userId || localStorage.getItem('constructmail_userId');

  const fetchState = useCallback(async () => {
    if (!uid) { setChecking(false); return; }
    try {
      const statusRes = await fetch(`${API_BASE_URL}/api/procore/status?userId=${uid}`);
      const statusData = await statusRes.json();
      setConnected(statusData.connected);

      if (statusData.connected) {
        const [projectsRes, linkRes] = await Promise.all([
          fetch(`${API_BASE_URL}/api/procore/projects?userId=${uid}`),
          hasActiveProject
            ? fetch(`${API_BASE_URL}/api/procore/project-link?projectId=${currentProjectId}`)
            : Promise.resolve(null),
        ]);
        const projectsData = await projectsRes.json();
        setProcoreProjects(projectsData.projects || []);
        if (linkRes) {
          const linkData = await linkRes.json();
          setLinkedProjectId(linkData.procoreProjectId || null);
        } else {
          setLinkedProjectId(null);
        }
      }
    } catch {
      setError('Could not check Procore connection.');
    } finally {
      setChecking(false);
    }
  }, [uid, currentProjectId, hasActiveProject]);

  useEffect(() => {
    setChanging(false);
    setError('');
    fetchState();
  }, [fetchState]);

  // OAuth popup posts PROCORE_CONNECTED when the redirect completes — same
  // listener pattern as Clash's ProcoreConnect.
  useEffect(() => {
    const handler = (e) => {
      if (e.data?.type === 'PROCORE_CONNECTED') fetchState();
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [fetchState]);

  const handleConnect = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/procore-url?userId=${uid}`);
      const data = await res.json();
      window.open(data.url, 'procore_oauth', 'width=600,height=700,scrollbars=yes');
    } catch {
      setError('Could not initiate Procore connection.');
    }
  };

  const handleLinkPick = async (e) => {
    const newId = e.target.value;
    if (!newId || !hasActiveProject) return;
    try {
      await fetch(`${API_BASE_URL}/api/procore/project-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: Number(currentProjectId), procoreProjectId: newId }),
      });
      setLinkedProjectId(newId);
      setChanging(false);
      setError('');
    } catch {
      setError('Could not save the project mapping.');
    }
  };

  const pomarProjectName =
    pomarProjects?.find((p) => String(p.id) === String(currentProjectId))?.name || 'this project';
  const linkedProcoreName =
    procoreProjects.find((p) => String(p.id) === String(linkedProjectId))?.name ||
    (linkedProjectId ? `Procore project #${linkedProjectId}` : null);

  if (checking) return null;

  return (
    <div className="pmis-setup-card">
      <div className="pmis-setup-left">
        <span className="pmis-logo">🔗</span>
        <div>
          <div className="pmis-title">
            PMIS Integration
            <span className={`pmis-status-pill ${connected ? 'connected' : ''}`}>
              {connected ? 'Procore connected' : 'Procore not connected'}
            </span>
            <span className="pmis-status-pill muted">Kahua — coming soon</span>
          </div>
          <div className="pmis-sub">
            {!connected
              ? 'Connect Procore once to push RFIs from any module.'
              : !hasActiveProject
                ? 'Select a project in the header to view or change its Procore mapping.'
                : linkedProjectId && !changing
                  ? <>Pushes from <strong>{pomarProjectName}</strong> go to <strong>{linkedProcoreName}</strong>.</>
                  : <>Choose the Procore project that <strong>{pomarProjectName}</strong> should push to.</>}
          </div>
        </div>
      </div>

      <div className="pmis-setup-actions">
        {!connected ? (
          <button className="pmis-btn-primary" onClick={handleConnect}>Connect Procore</button>
        ) : hasActiveProject && (!linkedProjectId || changing) ? (
          <>
            <select className="pmis-select" value={linkedProjectId || ''} onChange={handleLinkPick}>
              <option value="">Select Procore project…</option>
              {procoreProjects.map((p) => (
                <option key={p.id} value={String(p.id)}>{p.name || p.display_name}</option>
              ))}
            </select>
            {changing && (
              <button className="pmis-btn-secondary" onClick={() => setChanging(false)}>Cancel</button>
            )}
          </>
        ) : hasActiveProject ? (
          <button className="pmis-btn-secondary" onClick={() => setChanging(true)}>Change</button>
        ) : null}
      </div>

      {error && <div className="pmis-error">{error}</div>}
    </div>
  );
}
