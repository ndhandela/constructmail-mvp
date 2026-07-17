import React, { useState, useEffect, useCallback } from 'react';
import NoticeReviewModal from '../components/NoticeReviewModal';
import { API_BASE_URL, canReviewTrust, severityColor } from '../trustUtils';
import '../styles/TrustChangeAlerts.css';

export default function TrustChangeAlerts({ userId, project, trustRole }) {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [modalState, setModalState] = useState(null); // { alert, draftContent }
  const [error, setError] = useState('');

  const canReview = canReviewTrust(trustRole);

  const fetchAlerts = useCallback(async () => {
    if (!project) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/trust/projects/${project.id}/alerts?userId=${userId}&status=`);
      const data = await res.json();
      if (data.success) setAlerts(data.alerts);
    } finally {
      setLoading(false);
    }
  }, [project, userId]);

  useEffect(() => { fetchAlerts(); }, [fetchAlerts]);

  if (!project) {
    return <p className="trust-muted">Select or create a project to get started.</p>;
  }

  const handleDraftNotice = async (alert) => {
    setBusyId(alert.id);
    setError('');
    try {
      const res = await fetch(`${API_BASE_URL}/api/trust/alerts/${alert.id}/draft-notice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: Number(userId) }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.detail || 'Could not draft a notice.');
        return;
      }
      setModalState({ alert, draftContent: data.draft_content });
      fetchAlerts();
    } finally {
      setBusyId(null);
    }
  };

  const handleDismiss = async (alert) => {
    setBusyId(alert.id);
    try {
      await fetch(`${API_BASE_URL}/api/trust/alerts/${alert.id}/dismiss`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: Number(userId) }),
      });
      fetchAlerts();
    } finally {
      setBusyId(null);
    }
  };

  const openAlerts = alerts.filter((a) => a.status !== 'resolved' && a.status !== 'dismissed');

  return (
    <div className="trust-change-alerts">
      <h2>Change alerts</h2>
      {error && <div className="trust-error">{error}</div>}
      {loading ? (
        <p className="trust-muted">Loading…</p>
      ) : openAlerts.length === 0 ? (
        <p className="trust-muted">No open alerts — nothing flagged for buyer disclosure right now.</p>
      ) : (
        <div className="trust-alert-list">
          {openAlerts.map((alert) => (
            <div key={alert.id} className="trust-alert-card">
              <div className="trust-alert-card-header">
                <span className="trust-alert-type">{alert.alert_type.replace('_', ' ')}</span>
                <span
                  className="trust-severity-tag"
                  style={{ color: severityColor(alert.severity), borderColor: severityColor(alert.severity) }}
                >
                  {alert.severity} severity
                </span>
              </div>
              <p>{alert.description}</p>
              <p className="trust-muted">Detected {new Date(alert.detected_at).toLocaleString()}</p>

              <div className="trust-form-actions">
                <button
                  className="trust-btn-primary"
                  onClick={() => handleDraftNotice(alert)}
                  disabled={!canReview || busyId === alert.id}
                  title={!canReview ? 'Only a Compliance Reviewer or the GC Owner can draft a buyer notice.' : undefined}
                >
                  {busyId === alert.id ? 'Drafting…' : 'Draft buyer notice'}
                </button>
                <button
                  className="trust-btn-secondary"
                  onClick={() => handleDismiss(alert)}
                  disabled={!canReview || busyId === alert.id}
                  title={!canReview ? 'Only a Compliance Reviewer or the GC Owner can dismiss an alert.' : undefined}
                >
                  Dismiss
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {modalState && (
        <NoticeReviewModal
          userId={userId}
          alert={modalState.alert}
          draftContent={modalState.draftContent}
          onClose={() => setModalState(null)}
          onSent={() => { setModalState(null); fetchAlerts(); }}
        />
      )}
    </div>
  );
}
