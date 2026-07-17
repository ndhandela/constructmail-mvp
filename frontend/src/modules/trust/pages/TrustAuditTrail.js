import React, { useState, useEffect, useCallback } from 'react';
import { API_BASE_URL } from '../trustUtils';
import '../styles/TrustAuditTrail.css';

export default function TrustAuditTrail({ userId, project }) {
  const [notices, setNotices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [noticeType, setNoticeType] = useState('');
  const [deliveryStatus, setDeliveryStatus] = useState('');
  const [sort, setSort] = useState('desc');

  const fetchNotices = useCallback(async () => {
    if (!project) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ userId, sort });
      if (noticeType) params.set('notice_type', noticeType);
      if (deliveryStatus) params.set('delivery_status', deliveryStatus);
      const res = await fetch(`${API_BASE_URL}/api/trust/projects/${project.id}/audit-trail?${params}`);
      const data = await res.json();
      if (data.success) setNotices(data.notices);
    } finally {
      setLoading(false);
    }
  }, [project, userId, noticeType, deliveryStatus, sort]);

  useEffect(() => { fetchNotices(); }, [fetchNotices]);

  if (!project) {
    return <p className="trust-muted">Select or create a project to get started.</p>;
  }

  return (
    <div className="trust-audit-trail">
      <div className="trust-dashboard-header">
        <h2>Audit trail — buyer notices</h2>
        <div className="trust-audit-filters">
          <select value={noticeType} onChange={(e) => setNoticeType(e.target.value)}>
            <option value="">All notice types</option>
            <option value="qpr_summary">QPR summary</option>
            <option value="change_disclosure">Change disclosure</option>
          </select>
          <select value={deliveryStatus} onChange={(e) => setDeliveryStatus(e.target.value)}>
            <option value="">All delivery statuses</option>
            <option value="pending">Pending</option>
            <option value="confirmed">Confirmed</option>
            <option value="failed">Failed</option>
          </select>
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="desc">Newest first</option>
            <option value="asc">Oldest first</option>
          </select>
        </div>
      </div>

      {loading ? (
        <p className="trust-muted">Loading…</p>
      ) : notices.length === 0 ? (
        <p className="trust-muted">No buyer notices logged yet.</p>
      ) : (
        <div className="trust-table-wrapper">
          <table className="trust-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Unit</th>
                <th>Sent</th>
                <th>Sent by</th>
                <th>Delivery status</th>
                <th>Proof reference</th>
              </tr>
            </thead>
            <tbody>
              {notices.map((n) => (
                <tr key={n.id}>
                  <td>{n.notice_type.replace('_', ' ')}{n.alert_type ? ` (${n.alert_type.replace('_', ' ')})` : ''}</td>
                  <td>{n.unit_reference || '—'}</td>
                  <td className="trust-mono">{new Date(n.sent_at).toLocaleString()}</td>
                  <td>{n.sent_by_email || '—'}</td>
                  <td><span className={`trust-status-pill trust-status-${n.delivery_status}`}>{n.delivery_status}</span></td>
                  <td className="trust-mono">{n.proof_reference || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
