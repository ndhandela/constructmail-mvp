import React, { useState } from 'react';
import { API_BASE_URL } from '../documentsUtils';

// GC-only — server-side enforcement lives in routers/documents.py's
// grant/revoke endpoints (they 403 for a non-GC caller regardless of what
// this modal ever renders); this is purely the picker UI. subCompanies is
// the project-wide candidate list from the list-documents response, not
// re-fetched per document.
export default function ManageAccessModal({ document, subCompanies, userId, onChanged, onClose }) {
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const grantedCompanyIds = new Set((document.grants || []).map((g) => g.company_id));
  const availableCompanies = subCompanies.filter((c) => !grantedCompanyIds.has(c.id));

  const handleGrant = async () => {
    if (!selectedCompanyId) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE_URL}/api/documents/${document.id}/grant`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: Number(userId), granted_to_company_id: Number(selectedCompanyId) }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.detail || 'Could not grant access.'); return; }
      setSelectedCompanyId('');
      onChanged();
    } catch (err) {
      console.error('Grant access error:', err);
      setError('Network error. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const handleRevoke = async (companyId) => {
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE_URL}/api/documents/${document.id}/revoke`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: Number(userId), granted_to_company_id: Number(companyId) }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.detail || 'Could not revoke access.'); return; }
      onChanged();
    } catch (err) {
      console.error('Revoke access error:', err);
      setError('Network error. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="documents-modal-overlay" onClick={onClose}>
      <div className="documents-modal" onClick={(e) => e.stopPropagation()}>
        <h3>Manage access — {document.filename}</h3>

        <div className="documents-field">
          <label>Companies with access</label>
          {(document.grants || []).length === 0 ? (
            <p className="documents-muted">No Sub companies have been granted access yet.</p>
          ) : (
            <ul className="documents-grant-list">
              {document.grants.map((g) => (
                <li key={g.company_id}>
                  <span>{g.company_name}</span>
                  <button
                    type="button"
                    className="documents-link-btn documents-link-btn-danger"
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

        <div className="documents-field">
          <label>Grant access to a Sub company</label>
          <div className="documents-grant-row">
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
              className="documents-btn-primary"
              onClick={handleGrant}
              disabled={busy || !selectedCompanyId}
            >
              Grant
            </button>
          </div>
        </div>

        {error && <div className="documents-error">{error}</div>}
        <div className="documents-form-actions">
          <button type="button" className="documents-btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
