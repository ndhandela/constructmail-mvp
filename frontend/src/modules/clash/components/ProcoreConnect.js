import React, { useState, useEffect } from 'react';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

export default function ProcoreConnect({ userId, onConnected, onRFISent, rfiData }) {
  const [connected, setConnected] = useState(false);
  const [projects, setProjects]   = useState([]);
  const [projectId, setProjectId] = useState('');
  const [sending, setSending]     = useState(false);
  const [sent, setSent]           = useState(null);
  const [error, setError]         = useState('');
  const [checking, setChecking]   = useState(true);

  const checkStatus = async () => {
    if (!userId) { setChecking(false); return; }
    try {
      const res = await fetch(`${API_BASE_URL}/api/procore/status?userId=${userId}`);
      const data = await res.json();
      setConnected(data.connected);
      if (data.connected) fetchProjects();
    } catch {
      setConnected(false);
    } finally {
      setChecking(false);
    }
  };

  const fetchProjects = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/procore/projects?userId=${userId}`);
      const data = await res.json();
      setProjects(data.projects || []);
      if (data.projects?.length > 0) setProjectId(String(data.projects[0].id));
    } catch {
      setError('Could not load Procore projects.');
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { checkStatus(); }, [userId]);

  useEffect(() => {
    const handler = (e) => {
      if (e.data?.type === 'PROCORE_CONNECTED') {
        checkStatus();
        if (onConnected) onConnected();
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleConnect = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/procore-url?userId=${userId}`);
      const data = await res.json();
      window.open(data.url, 'procore_oauth', 'width=600,height=700,scrollbars=yes');
    } catch {
      setError('Could not initiate Procore connection.');
    }
  };

  const handleReconnect = async () => {
    try {
      await fetch(`${API_BASE_URL}/api/procore/disconnect?userId=${userId}`, {
        method: 'DELETE',
      });
      setConnected(false);
      setProjects([]);
      setProjectId('');
      setSent(null);
      setError('');
      handleConnect();
    } catch {
      setError('Could not reconnect. Please try again.');
    }
  };

  const handleSendRFI = async () => {
    if (!projectId) { setError('Please select a project.'); return; }
    setSending(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE_URL}/api/procore/create-rfi`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, projectId, rfiData }),
      });
      const data = await res.json();
      if (data.success) {
        setSent(data.rfi);
        if (onRFISent) onRFISent(data.rfi);
      } else {
        setError(data.error || 'Failed to create RFI.');
      }
    } catch {
      setError('Could not reach Procore. Try again.');
    } finally {
      setSending(false);
    }
  };

  if (checking) return (
    <div className="procore-connect">
      <div className="procore-checking">Checking Procore connection…</div>
    </div>
  );

  if (sent) return (
    <div className="procore-connect">
      <div className="procore-success">
        <span className="procore-success-icon">✅</span>
        <div>
          <p className="procore-success-title">RFI sent to Procore!</p>
          <p className="procore-success-sub">RFI #{sent.number} — {sent.subject}</p>
        </div>
      </div>
    </div>
  );

  return (
    <div className="procore-connect">
      <div className="procore-connect-header">
        <div className="procore-logo-badge">
          <span style={{ fontSize: 16 }}>🔗</span>
          <span className="procore-label">Procore</span>
        </div>
        {connected && <span className="procore-connected-pill">Connected</span>}
      </div>

      {!connected ? (
        <button className="procore-btn-connect" onClick={handleConnect}>
          Connect Procore to send RFI directly
        </button>
      ) : (
        <div>
          <div className="procore-send-row">
            <select
              className="rfi-select"
              value={projectId}
              onChange={e => setProjectId(e.target.value)}
              style={{ flex: 1 }}
            >
              <option value="">Select project…</option>
              {projects.map(p => (
                <option key={p.id} value={String(p.id)}>{p.name || p.display_name}</option>
              ))}
            </select>
            <button
              className="procore-btn-send"
              onClick={handleSendRFI}
              disabled={sending || !projectId}
            >
              {sending ? 'Sending…' : '🚀 Send to Procore'}
            </button>
          </div>
          <div className="procore-reconnect-row">
            <span className="procore-no-projects">
              {projects.length === 0 ? 'No projects found — try reconnecting.' : ''}
            </span>
            <button className="procore-btn-reconnect" onClick={handleReconnect}>
              ↺ Reconnect Procore
            </button>
          </div>
        </div>
      )}

      {error && <p className="procore-error">{error}</p>}
    </div>
  );
}
