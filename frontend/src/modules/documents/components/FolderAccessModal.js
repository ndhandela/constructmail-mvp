import React, { useState } from 'react';
import { API_BASE_URL } from '../documentsUtils';

// GC-only — mirrors components/ManageAccessModal.js's document-level grant
// UI, adapted for folders: a folder grant has no revoked_at (revoke hard-
// deletes the row server-side, routers/documents.py's revoke_folder_access),
// so there's no "reactivate" case to handle here, unlike documents.
// subCompanies is the project-wide candidate list from the list-folders
// response, not re-fetched per folder.
export default function FolderAccessModal({ folder, subCompanies, userId, onChanged, onClose }) {
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const grantedCompanyIds = new Set((folder.granted_companies || []).map((g) => g.company_id));
  const availableCompanies = subCompanies.filter((c) => !grantedCompanyIds.has(c.id));

  const handleGrant = async () => {
    if (!selectedCompanyId) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE_URL}/api/documents/folders/${folder.id}/access`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: Number(userId), company_id: Number(selectedCompanyId) }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.detail || 'Could not grant access.'); return; }
      setSelectedCompanyId('');
      onChanged();
    } catch (err) {
      console.error('Grant folder access error:', err);
      setError('Network error. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const handleRevoke = async (companyId) => {
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE_URL}/api/documents/folders/${folder.id}/access/${companyId}?userId=${userId}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) { setError(data.detail || 'Could not revoke access.'); return; }
      onChanged();
    } catch (err) {
      console.error('Revoke folder access error:', err);
      setError('Network error. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="documents-modal-overlay" onClick={onClose}>
      <div className="documents-modal" onClick={(e) => e.stopPropagation()}>
        <h3>Manage folder access — {folder.name}</h3>
        <p className="documents-muted">
          Access applies to this folder and everything inside it — documents uploaded here
          are automatically visible to whichever companies are granted below.
        </p>

        <div className="documents-field">
          <label>Companies with access</label>
          {(folder.granted_companies || []).length === 0 ? (
            <p className="documents-muted">No Sub companies have been granted access yet.</p>
          ) : (
            <ul className="documents-grant-list">
              {folder.granted_companies.map((g) => (
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
