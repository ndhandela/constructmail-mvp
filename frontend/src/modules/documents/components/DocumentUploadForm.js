import React, { useState } from 'react';
import { API_BASE_URL } from '../documentsUtils';

// projectId is fixed for the life of this form — sourced from the header's
// ProjectContext.currentProjectId by DocumentsApp.js, never picked here.
// Same pattern as modules/invoices/components/InvoiceUploadForm.js.
export default function DocumentUploadForm({ userId, projectId, onSaved, onCancel }) {
  const [category, setCategory] = useState('');
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!projectId) { setError('No project selected. Choose one from the header first.'); return; }
    if (!file) { setError('Choose a file to upload.'); return; }

    setSaving(true);
    setError('');
    try {
      const body = new FormData();
      body.append('userId', userId);
      body.append('project_id', projectId);
      if (category.trim()) body.append('category', category.trim());
      body.append('file', file);

      const res = await fetch(`${API_BASE_URL}/api/documents/upload`, { method: 'POST', body });
      const data = await res.json();
      if (!res.ok) {
        setError(data.detail || 'Could not upload document.');
        return;
      }
      onSaved();
    } catch (err) {
      console.error('Upload document error:', err);
      setError('Network error. Try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="documents-modal-overlay" onClick={onCancel}>
      <form className="documents-modal" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <h3>Upload document</h3>

        <div className="documents-field">
          <label>File</label>
          <input
            type="file"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            required
            disabled={saving}
          />
        </div>

        <div className="documents-field">
          <label>Category (optional)</label>
          <input
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="e.g. contracts, drawings, submittals"
            disabled={saving}
          />
        </div>

        {error && <div className="documents-error">{error}</div>}
        <div className="documents-form-actions">
          <button type="button" className="documents-btn-secondary" onClick={onCancel} disabled={saving}>Cancel</button>
          <button type="submit" className="documents-btn-primary" disabled={saving}>
            {saving ? 'Uploading…' : 'Upload document'}
          </button>
        </div>
      </form>
    </div>
  );
}
