import React, { useState } from 'react';
import { API_BASE_URL } from '../documentsUtils';

// GC-only — server-side enforcement is routers/documents.py's create_folder
// (require_gc), this is purely the creation UI. projectId is fixed, same
// pattern as DocumentUploadForm.js.
export default function NewFolderModal({ userId, projectId, onSaved, onCancel }) {
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) { setError('Folder name is required.'); return; }

    setSaving(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE_URL}/api/documents/projects/${projectId}/folders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: Number(userId), name: name.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.detail || 'Could not create folder.');
        return;
      }
      onSaved(data.folder);
    } catch (err) {
      console.error('Create folder error:', err);
      setError('Network error. Try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="documents-modal-overlay" onClick={onCancel}>
      <form className="documents-modal" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <h3>New folder</h3>

        <div className="documents-field">
          <label>Folder name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Contracts"
            autoFocus
            required
            disabled={saving}
          />
        </div>

        {error && <div className="documents-error">{error}</div>}
        <div className="documents-form-actions">
          <button type="button" className="documents-btn-secondary" onClick={onCancel} disabled={saving}>Cancel</button>
          <button type="submit" className="documents-btn-primary" disabled={saving}>
            {saving ? 'Creating…' : 'Create folder'}
          </button>
        </div>
      </form>
    </div>
  );
}
