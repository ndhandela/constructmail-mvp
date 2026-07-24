import React, { useState, useEffect, useCallback, useContext, useRef } from 'react';
import { ProjectContext, ALL_PROJECTS } from '../../../contexts/ProjectContext';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

// Human copy for each /api/procore/status `reason` — drives both the status
// pill and the sub-line. 'not_connected' keeps the original first-time-setup
// copy; the others are all "you were connected, now you're not" states that
// get a Reconnect recovery path instead of a dead end.
const STATUS_COPY = {
  not_connected: { pill: 'Procore not connected' },
  expired: { pill: 'Procore connection expired', sub: 'Your Procore connection expired. Reconnect to keep pushing RFIs.' },
  token_invalid: { pill: 'Procore connection broken', sub: 'Procore rejected the stored connection. Reconnect to fix it.' },
  api_error: { pill: 'Procore connection broken', sub: "Couldn't verify the Procore connection right now. Reconnect if this keeps happening." },
};

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
  const [reason, setReason] = useState(null);
  const [procoreProjects, setProcoreProjects] = useState([]);
  const [linkedProjectId, setLinkedProjectId] = useState(null);
  const [changing, setChanging] = useState(false);
  const [error, setError] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [toast, setToast] = useState(null);

  const popupPollRef = useRef(null);
  const toastTimerRef = useRef(null);

  const uid = userId || localStorage.getItem('constructmail_userId');

  const showToast = (type, message) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ type, message });
    toastTimerRef.current = setTimeout(() => setToast(null), 4000);
  };

  const fetchState = useCallback(async () => {
    if (!uid) { setChecking(false); return; }
    try {
      const statusRes = await fetch(`${API_BASE_URL}/api/procore/status?userId=${uid}`);
      const statusData = await statusRes.json();
      setConnected(statusData.connected);
      setReason(statusData.connected ? null : (statusData.reason || 'not_connected'));

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
      } else {
        setProcoreProjects([]);
        setLinkedProjectId(null);
      }
    } catch {
      // The /status call itself failed (network/CORS/backend down) — we
      // never got a `reason` back, but the user still needs a way out, so
      // this counts as a broken connection too rather than leaving the
      // button on its first-time-setup "Connect Procore" wording.
      setConnected(false);
      setReason('api_error');
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

  useEffect(() => () => {
    if (popupPollRef.current) clearInterval(popupPollRef.current);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
  }, []);

  // OAuth popup posts PROCORE_CONNECTED when the redirect completes — same
  // listener pattern as Clash's ProcoreConnect.
  useEffect(() => {
    const handler = (e) => {
      if (e.data?.type === 'PROCORE_CONNECTED') {
        if (popupPollRef.current) clearInterval(popupPollRef.current);
        setConnecting(false);
        setError('');
        fetchState();
        showToast('success', 'Procore connected successfully.');
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [fetchState]);

  // Same OAuth flow for first-time connect AND reconnect — the callback
  // overwrites the stored token (ON CONFLICT UPDATE) rather than requiring
  // it to be cleared first, so a cancelled attempt leaves the previous
  // connection untouched instead of leaving the user disconnected. We poll
  // popup.closed since a manually-closed popup never posts a message.
  const handleConnect = async () => {
    setConnecting(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/procore-url?userId=${uid}`);
      const data = await res.json();
      const popup = window.open(data.url, 'procore_oauth', 'width=600,height=700,scrollbars=yes');

      if (popupPollRef.current) clearInterval(popupPollRef.current);
      popupPollRef.current = setInterval(() => {
        if (popup && popup.closed) {
          clearInterval(popupPollRef.current);
          popupPollRef.current = null;
          setConnecting(false);
        }
      }, 500);
    } catch {
      setConnecting(false);
      setError('Could not initiate Procore connection.');
      showToast('error', 'Could not initiate Procore connection.');
    }
  };

  const handleDisconnect = async () => {
    if (!window.confirm("Disconnect Procore? You'll need to reconnect before pushing RFIs again.")) return;
    setDisconnecting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/procore/disconnect?userId=${uid}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('disconnect failed');
      setChanging(false);
      await fetchState();
      showToast('success', 'Procore disconnected.');
    } catch {
      showToast('error', 'Could not disconnect Procore.');
    } finally {
      setDisconnecting(false);
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

  // Broken-but-previously-connected states get "Reconnect Procore"; a
  // never-connected account keeps the original "Connect Procore" wording.
  // Both call the exact same handler — only the label differs.
  const needsReconnect = !connected && reason && reason !== 'not_connected';
  const statusCopy = STATUS_COPY[reason] || STATUS_COPY.not_connected;
  const pillLabel = connected ? 'Procore connected' : statusCopy.pill;
  // Skip the reason sub-line when the generic fetch-error banner is already
  // showing below — otherwise a dead /status call renders two overlapping
  // explanations for the same problem.
  const subCopy = !connected && !error && statusCopy.sub;

  return (
    <div className="pmis-setup-card">
      <div className="pmis-setup-left">
        <span className="pmis-logo">🔗</span>
        <div>
          <div className="pmis-title">
            PMIS Integration
            <span className={`pmis-status-pill ${connected ? 'connected' : ''}`}>
              {pillLabel}
            </span>
            <span className="pmis-status-pill muted">Kahua — coming soon</span>
          </div>
          <div className="pmis-sub">
            {subCopy
              ? subCopy
              : !connected
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
          <button className="pmis-btn-primary" onClick={handleConnect} disabled={connecting}>
            {connecting ? 'Connecting…' : needsReconnect ? 'Reconnect Procore' : 'Connect Procore'}
          </button>
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

        {connected && (
          <button className="pmis-btn-link" onClick={handleDisconnect} disabled={disconnecting}>
            {disconnecting ? 'Disconnecting…' : 'Disconnect'}
          </button>
        )}
      </div>

      {error && <div className="pmis-error">{error}</div>}
      {toast && <div className={`pmis-toast pmis-toast-${toast.type}`}>{toast.message}</div>}
    </div>
  );
}
