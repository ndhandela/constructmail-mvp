import React, { useState, useEffect } from 'react';
import '../styles/RemovalRequestsQueue.css';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

function ResolveRow({ token, request, onResolved }) {
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(null); // 'approved' | 'denied' | null

  const resolve = async (status) => {
    setSubmitting(status);
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/admin/marketplace/removal-requests/${request.id}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ status, resolution_note: note || null }),
        }
      );
      const data = await res.json();
      if (data.success) onResolved(data.request);
    } catch (err) {
      console.error('Resolve removal request error:', err);
    } finally {
      setSubmitting(null);
    }
  };

  return (
    <div className="rrq-resolve-row">
      <input
        type="text"
        placeholder="Resolution note (optional)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <button
        className="rrq-btn rrq-btn-approve"
        onClick={() => resolve('approved')}
        disabled={!!submitting}
      >
        {submitting === 'approved' ? 'Approving…' : 'Approve (remove listing)'}
      </button>
      <button
        className="rrq-btn rrq-btn-deny"
        onClick={() => resolve('denied')}
        disabled={!!submitting}
      >
        {submitting === 'denied' ? 'Denying…' : 'Deny'}
      </button>
    </div>
  );
}

export default function RemovalRequestsQueue({ token, onNavigate }) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('pending');
  const [pagination, setPagination] = useState({ offset: 0, limit: 50, total: 0 });

  useEffect(() => {
    fetchRequests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagination.offset, status]);

  const fetchRequests = async () => {
    setLoading(true);
    try {
      const statusParam = status ? `&status=${status}` : '';
      const res = await fetch(
        `${API_BASE_URL}/api/admin/marketplace/removal-requests?limit=${pagination.limit}&offset=${pagination.offset}${statusParam}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await res.json();
      if (data.success) {
        setRequests(data.requests);
        setPagination((prev) => ({ ...prev, total: data.total }));
      }
    } catch (err) {
      console.error('Fetch removal requests error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleResolved = (updated) => {
    // Requests move out of the 'pending' filter once resolved — simplest
    // correct behavior is just dropping it from the current list rather
    // than re-fetching the whole page.
    setRequests((prev) => prev.filter((r) => r.id !== updated.id));
  };

  const handleNextPage = () => setPagination((p) => ({ ...p, offset: p.offset + p.limit }));
  const handlePrevPage = () => setPagination((p) => ({ ...p, offset: Math.max(0, p.offset - p.limit) }));
  const hasNextPage = pagination.offset + pagination.limit < pagination.total;
  const hasPrevPage = pagination.offset > 0;

  if (loading) {
    return <div className="rrq-loading">Loading removal requests…</div>;
  }

  return (
    <div className="removal-requests-queue">
      <div className="rrq-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2>Marketplace Removal Requests</h2>
            <p>Business owners asking to have an unclaimed listing taken down. Approving removes the listing — deny if the request looks illegitimate (e.g. a competitor).</p>
          </div>
          <select
            value={status}
            onChange={(e) => { setStatus(e.target.value); setPagination((p) => ({ ...p, offset: 0 })); }}
            style={{ marginRight: 12, padding: '8px 12px', borderRadius: 8 }}
          >
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="denied">Denied</option>
            <option value="">All</option>
          </select>
          <button className="rrq-back-btn" onClick={() => onNavigate('dashboard')}>
            ← Back to Dashboard
          </button>
        </div>
      </div>

      <div className="rrq-container">
        {requests.length === 0 ? (
          <div className="rrq-empty">No {status || ''} removal requests.</div>
        ) : (
          <div className="rrq-list">
            {requests.map((r) => (
              <div key={r.id} className="rrq-card">
                <div className="rrq-card-header">
                  <strong>{r.listing_name || 'Unknown listing'}</strong>
                  <span className={`rrq-status-badge rrq-status-${r.status}`}>{r.status}</span>
                </div>
                <div className="rrq-card-body">
                  <div><span className="rrq-label">Requested by</span> {r.requester_name} ({r.requester_email})</div>
                  <div><span className="rrq-label">Business name claimed</span> {r.business_name}</div>
                  <div><span className="rrq-label">Reason</span> {r.reason}</div>
                  <div><span className="rrq-label">Submitted</span> {new Date(r.created_at).toLocaleString()}</div>
                  {r.resolution_note && (
                    <div><span className="rrq-label">Resolution note</span> {r.resolution_note}</div>
                  )}
                </div>
                {r.status === 'pending' && (
                  <ResolveRow token={token} request={r} onResolved={handleResolved} />
                )}
              </div>
            ))}
          </div>
        )}

        <div className="rrq-pagination">
          <button onClick={handlePrevPage} disabled={!hasPrevPage || loading} className="rrq-pagination-btn">
            ← Previous
          </button>
          <span className="rrq-pagination-info">
            Page {Math.floor(pagination.offset / pagination.limit) + 1}
          </span>
          <button onClick={handleNextPage} disabled={!hasNextPage || loading} className="rrq-pagination-btn">
            Next →
          </button>
        </div>
      </div>
    </div>
  );
}
