import React, { useState } from 'react';
import { API_BASE_URL } from '../permitsUtils';

// GC-only — server-side enforcement lives in routers/permits.py's
// grant/revoke endpoints; this is purely the picker UI. Mirrors
// modules/documents/components/ManageAccessModal.js exactly (same request
// shape, same POST /revoke rather than DELETE). subCompanies is the
// project-wide candidate list from the list-permits response, not
// re-fetched per permit.
export default function ManagePermitAccessModal({ permit, subCompanies, userId, onChanged, onClose }) {
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const grantedCompanyIds = new Set((permit.grants || []).map((g) => g.company_id));
  const availableCompanies = subCompanies.filter((c) => !grantedCompanyIds.has(c.id));

  const handleGrant = async () => {
    if (!selectedCompanyId) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE_URL}/api/permits/${permit.id}/grant`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: Number(userId), granted_to_company_id: Number(selectedCompanyId) }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.detail || 'Could not grant access.'); return; }
      setSelectedCompanyId('');
      onChanged();
    } catch (err) {
      console.error('Grant permit access error:', err);
      setError('Network error. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const handleRevoke = async (companyId) => {
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE_URL}/api/permits/${permit.id}/revoke`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: Number(userId), granted_to_company_id: Number(companyId) }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.detail || 'Could not revoke access.'); return; }
      onChanged();
    } catch (err) {
      console.error('Revoke permit access error:', err);
      setError('Network error. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="permits-modal-overlay" onClick={onClose}>
      <div className="permits-modal" onClick={(e) => e.stopPropagation()}>
        <h3>Manage access — {permit.permit_type}</h3>

        <div className="permits-field">
          <label>Companies with view access</label>
          {(permit.grants || []).length === 0 ? (
            <p className="permits-muted">No Sub companies have been granted access yet.</p>
          ) : (
            <ul className="permits-grant-list">
              {permit.grants.map((g) => (
                <li key={g.company_id}>
                  <span>{g.company_name}</span>
                  <button
                    type="button"
                    className="permits-link-btn permits-link-btn-danger"
                    onClick={() => handleRevoke(g.company_id)}
                    disabled={busy}
                  >
                    Revoke
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="permits-field">
          <label>Grant view access to a Sub company</label>
          <div className="permits-grant-row">
            <select
              value={selectedCompanyId}
              onChange={(e) => setSelectedCompanyId(e.target.value)}
              disabled={busy || availableCompanies.length === 0}
            >
              <option value="">
                {availableCompanies.length === 0 ? 'No more Sub companies to grant' : '— Select a company —'}
              </option>
              {availableCompanies.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <button
              type="button"
              className="permits-btn-primary"
              onClick={handleGrant}
              disabled={busy || !selectedCompanyId}
            >
              Grant
            </button>
          </div>
        </div>

        {error && <div className="permits-error">{error}</div>}
        <div className="permits-form-actions">
          <button type="button" className="permits-btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
