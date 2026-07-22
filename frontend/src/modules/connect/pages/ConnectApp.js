import React, { useState, useEffect, useCallback, useContext } from 'react';
import { ProjectContext, ALL_PROJECTS } from '../../../contexts/ProjectContext';
import PmisSetupCard from '../components/PmisSetupCard';
import '../styles/ConnectApp.css';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

// ── Helpers ────────────────────────────────────────────────────────────────

function timeAgo(ts) {
  if (!ts) return '';
  const diff = (Date.now() - new Date(ts).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function ModuleIcon({ module }) {
  const icons = { mail: '✉️', clash: '⚡', vendor: '🏢' };
  return (
    <div className={`module-icon ${module}`}>
      {icons[module] || '📋'}
    </div>
  );
}

function TypeBadge({ type }) {
  const labels = { rfi: 'RFI', change_order: 'Change Order', clash: 'Clash', compliance: 'Compliance' };
  return <span className={`type-badge ${type}`}>{labels[type] || type}</span>;
}

function PriorityDot({ priority }) {
  return <span className={`priority-dot ${priority}`}>{priority}</span>;
}

// ── KPI Card ──────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, colorClass }) {
  return (
    <div className={`kpi-card ${colorClass || ''}`}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value ?? '—'}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────

export default function ConnectApp({ userId }) {
  const [queue, setQueue] = useState([]);
  const [log, setLog] = useState([]);
  const [kpis, setKpis] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pushing, setPushing] = useState({});
  const [toast, setToast] = useState(null);

  const [drafts, setDrafts] = useState([]);
  const [editingDraftId, setEditingDraftId] = useState(null);
  const [draftBodies, setDraftBodies] = useState({});
  const [sendingDraft, setSendingDraft] = useState({});

  const { currentProjectId } = useContext(ProjectContext);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const uid = userId || localStorage.getItem('constructmail_userId');
      const projectParam = currentProjectId && currentProjectId !== ALL_PROJECTS
        ? `project_id=${currentProjectId}`
        : '';
      const qs = [uid ? `user_id=${uid}` : '', projectParam].filter(Boolean).join('&');
      const qsPrefixed = qs ? `?${qs}` : '';

      const [qRes, lRes, kRes, dRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/connect/queue${qsPrefixed}`),
        fetch(`${API_BASE_URL}/api/connect/log?limit=10${projectParam ? `&${projectParam}` : ''}`),
        fetch(`${API_BASE_URL}/api/connect/kpis${qsPrefixed}`),
        uid ? fetch(`${API_BASE_URL}/api/mail/drafts?userId=${uid}`) : Promise.resolve(null),
      ]);

      const [qData, lData, kData, dData] = await Promise.all([
        qRes.json(), lRes.json(), kRes.json(), dRes ? dRes.json() : Promise.resolve([]),
      ]);

      setQueue(Array.isArray(qData) ? qData : []);
      setLog(Array.isArray(lData) ? lData : []);
      setKpis(kData);
      setDrafts(Array.isArray(dData) ? dData : []);
    } catch (err) {
      console.error('Connect fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [userId, currentProjectId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ── Draft reply handlers ──────────────────────────────────────────────

  const currentDraftBody = (draft) =>
    draftBodies[draft.id] ?? draft.edited_body ?? draft.ai_generated_body;

  const handleDraftEdit = (draft) => {
    setDraftBodies(b => ({ ...b, [draft.id]: currentDraftBody(draft) }));
    setEditingDraftId(draft.id);
  };

  const handleDraftBodyChange = (draftId, value) => {
    setDraftBodies(b => ({ ...b, [draftId]: value }));
  };

  const handleApproveAndSend = async (draft) => {
    setSendingDraft(s => ({ ...s, [draft.id]: true }));
    try {
      const body = currentDraftBody(draft);
      if (body !== (draft.edited_body ?? draft.ai_generated_body)) {
        await fetch(`${API_BASE_URL}/api/mail/drafts/${draft.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ edited_body: body }),
        });
      }
      const res = await fetch(`${API_BASE_URL}/api/mail/${draft.provider}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draft_reply_id: draft.id }),
      });
      const data = await res.json();
      if (res.ok) {
        showToast('✅ Reply sent');
        setDrafts(d => d.filter(x => x.id !== draft.id));
        setEditingDraftId(id => (id === draft.id ? null : id));
      } else {
        showToast(`❌ ${data.detail || 'Send failed'}`, 'error');
      }
    } catch (err) {
      showToast('❌ Network error', 'error');
    } finally {
      setSendingDraft(s => ({ ...s, [draft.id]: false }));
    }
  };

  const handleDiscardDraft = async (draft) => {
    try {
      await fetch(`${API_BASE_URL}/api/mail/drafts/${draft.id}/discard`, { method: 'POST' });
      setDrafts(d => d.filter(x => x.id !== draft.id));
      showToast('Draft discarded');
    } catch (err) {
      showToast('❌ Failed to discard', 'error');
    }
  };

  const handlePush = async (item) => {
    setPushing(p => ({ ...p, [item.id]: true }));
    try {
      const uid = userId || localStorage.getItem('constructmail_userId');
      const res = await fetch(`${API_BASE_URL}/api/connect/queue/${item.id}/push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: uid ? parseInt(uid) : null }),
      });
      const data = await res.json();
      if (res.ok) {
        showToast(`✅ ${data.message || 'Pushed successfully'}`);
        setQueue(q => q.filter(x => x.id !== item.id));
        fetchAll(); // refresh KPIs + log
      } else {
        showToast(`❌ ${data.detail || 'Push failed'}`, 'error');
      }
    } catch (err) {
      showToast('❌ Network error', 'error');
    } finally {
      setPushing(p => ({ ...p, [item.id]: false }));
    }
  };

  const handleDismiss = async (item) => {
    try {
      await fetch(`${API_BASE_URL}/api/connect/queue/${item.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'dismissed' }),
      });
      setQueue(q => q.filter(x => x.id !== item.id));
      showToast('Item dismissed');
    } catch (err) {
      showToast('❌ Failed to dismiss', 'error');
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="connect-app">

      {/* Header */}
      <div className="connect-header">
        <div>
          <h1>
            POMAR Connect
            <span className="connect-badge">V1</span>
          </h1>
        </div>
        <div className="connect-header-right">
          <button className="connect-refresh-btn" onClick={fetchAll}>↻ Refresh</button>
        </div>
      </div>

      {/* KPI Row */}
      <div className="connect-kpi-row">
        <KpiCard
          label="Pending Actions"
          value={kpis?.pending_actions ?? '—'}
          sub="Items awaiting action"
          colorClass={kpis?.pending_actions > 0 ? 'kpi-orange' : ''}
        />
        <KpiCard
          label="RFIs Drafted Today"
          value={kpis?.rfis_drafted_today ?? '—'}
          sub="From Mail signals"
        />
        <KpiCard
          label="Clash Alerts"
          value={kpis?.clash_alerts ?? '—'}
          sub="High / critical pending"
          colorClass={kpis?.clash_alerts > 0 ? 'kpi-red' : ''}
        />
        <KpiCard
          label="Vendor Compliance"
          value={kpis ? `${kpis.vendor_compliance_pct}%` : '—'}
          sub="Vendors with no flags"
          colorClass={kpis?.vendor_compliance_pct >= 80 ? 'kpi-green' : 'kpi-orange'}
        />
      </div>

      {/* PMIS connection + project mapping */}
      <div className="pmis-setup-row">
        <PmisSetupCard userId={userId} />
      </div>

      {/* Body */}
      <div className="connect-body">

        {/* Action Queue */}
        <div>
          <div className="connect-section-header">
            <h2>
              Action Queue
              {(queue.length + drafts.length) > 0 && (
                <span className="count-badge">{queue.length + drafts.length}</span>
              )}
            </h2>
          </div>

          {drafts.length > 0 && (
            <div className="draft-reply-list">
              {drafts.map(draft => (
                <div className="draft-reply-card" key={draft.id}>
                  <div className="draft-reply-header">
                    <span className={`draft-reply-provider ${draft.provider}`}>
                      {draft.provider === 'gmail' ? '✉️ Gmail' : '📧 Outlook'}
                    </span>
                    <span className="draft-reply-people">
                      {draft.from && <>From: {draft.from}</>}
                      {draft.to && <> · To: {draft.to}</>}
                    </span>
                  </div>
                  {draft.subject && <div className="draft-reply-subject">{draft.subject}</div>}
                  {draft.snippet && (
                    <div className="draft-reply-original">
                      <span className="draft-reply-label">Original</span>
                      <p>{draft.snippet}</p>
                    </div>
                  )}
                  <div className="draft-reply-body-section">
                    <span className="draft-reply-label">AI-drafted reply</span>
                    {editingDraftId === draft.id ? (
                      <textarea
                        className="draft-reply-textarea"
                        value={currentDraftBody(draft)}
                        onChange={(e) => handleDraftBodyChange(draft.id, e.target.value)}
                        rows={6}
                      />
                    ) : (
                      <p className="draft-reply-text">{currentDraftBody(draft)}</p>
                    )}
                  </div>
                  <div className="draft-reply-actions">
                    <button
                      className="dismiss-btn"
                      onClick={() => (editingDraftId === draft.id ? setEditingDraftId(null) : handleDraftEdit(draft))}
                    >
                      {editingDraftId === draft.id ? 'Done Editing' : 'Edit'}
                    </button>
                    <button
                      className="push-btn"
                      disabled={sendingDraft[draft.id]}
                      onClick={() => handleApproveAndSend(draft)}
                    >
                      {sendingDraft[draft.id] ? 'Sending…' : '✓ Approve & Send'}
                    </button>
                    <button className="dismiss-btn" onClick={() => handleDiscardDraft(draft)}>
                      Discard
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="connect-queue-card">
            {loading ? (
              <>
                <div className="skeleton-row" />
                <div className="skeleton-row" />
                <div className="skeleton-row" />
              </>
            ) : queue.length === 0 ? (
              <div className="queue-empty">
                <div className="empty-icon">✅</div>
                <p>No pending actions. You're all caught up!</p>
              </div>
            ) : (
              <table className="queue-table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Type</th>
                    <th>Priority</th>
                    <th>Age</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {queue.map(item => (
                    <tr key={item.id}>
                      <td>
                        <div className="queue-title-cell">
                          <ModuleIcon module={item.module} />
                          <div>
                            <div className="queue-title-text">{item.title}</div>
                            {item.detail && (
                              <div className="queue-detail-text">{item.detail}</div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td><TypeBadge type={item.type} /></td>
                      <td><PriorityDot priority={item.priority} /></td>
                      <td><span className="time-ago">{timeAgo(item.created_at)}</span></td>
                      <td>
                        {item.module === 'vendor' ? (
                          <button
                            className="push-btn vendor-btn"
                            disabled={pushing[item.id]}
                            onClick={() => handlePush(item)}
                          >
                            {pushing[item.id] ? 'Sending…' : '📧 Send Reminder'}
                          </button>
                        ) : (
                          <button
                            className="push-btn"
                            disabled={pushing[item.id]}
                            onClick={() => handlePush(item)}
                          >
                            {pushing[item.id]
                              ? 'Pushing…'
                              : `Push to ${item.pmis_target === 'kahua' ? 'Kahua' : 'Procore'}`}
                          </button>
                        )}
                        <button
                          className="dismiss-btn"
                          onClick={() => handleDismiss(item)}
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Automation Log */}
        <div>
          <div className="connect-section-header">
            <h2>Automation Log</h2>
          </div>
          <div className="connect-log-card">
            {log.length === 0 ? (
              <div className="queue-empty" style={{ padding: '28px' }}>
                <p>No actions logged yet.</p>
              </div>
            ) : (
              <ul className="log-list">
                {log.map(entry => (
                  <li key={entry.id} className="log-item">
                    <div className={`log-dot ${entry.status}`} />
                    <span className="log-action">{entry.action}</span>
                    <span className="log-module">{entry.module}</span>
                    <span className="log-time">{timeAgo(entry.created_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

      </div>

      {/* Toast */}
      {toast && (
        <div className={`connect-toast ${toast.type}`}>{toast.msg}</div>
      )}
    </div>
  );
}
