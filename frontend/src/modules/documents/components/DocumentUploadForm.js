import React, { useState } from 'react';
import { API_BASE_URL } from '../documentsUtils';

// projectId is fixed for the life of this form — sourced from the header's
// ProjectContext.currentProjectId by DocumentsApp.js, never picked here.
// Same pattern as modules/invoices/components/InvoiceUploadForm.js. folderId
// is likewise sourced from whichever folder is currently open in the
// sidebar (null means project root) — there's no folder picker here either,
// it's attached automatically.
export default function DocumentUploadForm({ userId, projectId, folderId, folderName, onSaved, onCancel }) {
  const [category, setCategory] = useState('');
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  // Set when the backend 409s with a filename collision — holds the
  // {message, existing_document} payload so we can render a confirm step
  // instead of the normal fields. Nothing has touched R2/DB at this point,
  // so canceling out of it is a pure no-op (no network call at all).
  const [collision, setCollision] = useState(null);

  const doUpload = async (confirmOverwrite) => {
    setSaving(true);
    setError('');
    try {
      const body = new FormData();
      body.append('userId', userId);
      body.append('project_id', projectId);
      if (folderId != null) body.append('folder_id', folderId);
      if (category.trim()) body.append('category', category.trim());
      if (confirmOverwrite) body.append('confirm_overwrite', 'true');
      body.append('file', file);

      const res = await fetch(`${API_BASE_URL}/api/documents/upload`, { method: 'POST', body });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 409 && data.detail?.collision) {
          setCollision(data.detail);
          return;
        }
        setError((typeof data.detail === 'string' && data.detail) || 'Could not upload document.');
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

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!projectId) { setError('No project selected. Choose one from the header first.'); return; }
    if (!file) { setError('Choose a file to upload.'); return; }
    doUpload(false);
  };

  return (
    <div className="documents-modal-overlay" onClick={onCancel}>
      <div className="documents-modal" onClick={(e) => e.stopPropagation()}>
        {collision ? (
          <>
            <h3>Replace existing file?</h3>
            <p>{collision.message}</p>
            {error && <div className="documents-error">{error}</div>}
            <div className="documents-form-actions">
              <button
                type="button"
                className="documents-btn-secondary"
                onClick={() => setCollision(null)}
                disabled={saving}
              >
                Cancel
              </button>
              <button
                type="button"
                className="documents-btn-primary"
                onClick={() => doUpload(true)}
                disabled={saving}
              >
                {saving ? 'Replacing…' : 'Replace file'}
              </button>
            </div>
          </>
        ) : (
          <form onSubmit={handleSubmit}>
            <h3>Upload document{folderName ? ` to "${folderName}"` : ''}</h3>

            <div className="documents-field">
              <label>File</label>
              <input
                type="file"
                // capture="environment" only changes anything on mobile
                // browsers that support it — it adds a "Take Photo" option
                // alongside the normal file picker (no accept restriction,
                // so PDFs/drawings from Files are still pickable there too).
                // Desktop browsers ignore the attribute entirely and show
                // their ordinary file picker, unchanged.
                capture="environment"
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
        )}
      </div>
    </div>
  );
}
