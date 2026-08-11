import React, { useState } from 'react';
import { API_BASE_URL } from '../permitsUtils';

// projectId is fixed for the life of this form — sourced from the header's
// ProjectContext.currentProjectId by PermitTrackerApp.js, same pattern as
// modules/documents/components/DocumentUploadForm.js and
// modules/invoices/components/InvoiceUploadForm.js.
//
// File attachment reuses the existing Documents upload flow as-is rather
// than inventing a second uploader: a chosen file is POSTed straight to
// POST /api/documents/upload (category 'Permits') and the resulting
// document_id is what actually gets stored on the permit. There's no new
// bucket, endpoint, or upload component here.
export default function PermitForm({ userId, projectId, permit, onSaved, onCancel }) {
  const isEdit = !!permit;
  const [form, setForm] = useState({
    permit_type: permit?.permit_type || '',
    permit_number: permit?.permit_number || '',
    issuing_authority: permit?.issuing_authority || '',
    issue_date: permit?.issue_date || '',
    expiration_date: permit?.expiration_date || '',
    notes: permit?.notes || '',
  });
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!projectId) { setError('No project selected. Choose one from the header first.'); return; }
    if (!form.permit_type.trim()) { setError('Permit type is required.'); return; }
    if (!form.expiration_date) { setError('Expiration date is required.'); return; }

    setSaving(true);
    setError('');
    try {
      let documentId;
      if (file) {
        const uploadBody = new FormData();
        uploadBody.append('userId', userId);
        uploadBody.append('project_id', projectId);
        uploadBody.append('category', 'Permits');
        uploadBody.append('file', file);
        const uploadRes = await fetch(`${API_BASE_URL}/api/documents/upload`, { method: 'POST', body: uploadBody });
        const uploadData = await uploadRes.json();
        if (!uploadRes.ok) {
          setError((typeof uploadData.detail === 'string' && uploadData.detail) || 'Could not upload the attached file.');
          return;
        }
        documentId = uploadData.document.id;
      }

      const payload = {
        userId: Number(userId),
        permit_type: form.permit_type.trim(),
        permit_number: form.permit_number.trim() || null,
        issuing_authority: form.issuing_authority.trim() || null,
        issue_date: form.issue_date || null,
        expiration_date: form.expiration_date,
        notes: form.notes.trim() || null,
      };
      if (documentId !== undefined) payload.document_id = documentId;

      const res = isEdit
        ? await fetch(`${API_BASE_URL}/api/permits/${permit.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
        : await fetch(`${API_BASE_URL}/api/permits/projects/${projectId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
      const data = await res.json();
      if (!res.ok) {
        setError((typeof data.detail === 'string' && data.detail) || 'Could not save permit.');
        return;
      }
      onSaved();
    } catch (err) {
      console.error('Save permit error:', err);
      setError('Network error. Try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="permits-modal-overlay" onClick={onCancel}>
      <form className="permits-modal" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <h3>{isEdit ? 'Edit permit' : 'Add permit'}</h3>

        <div className="permits-form-row">
          <div className="permits-field">
            <label>Permit Type</label>
            <input
              value={form.permit_type}
              onChange={(e) => setForm((f) => ({ ...f, permit_type: e.target.value }))}
              placeholder="e.g. Building Permit"
              required
              disabled={saving}
            />
          </div>
          <div className="permits-field">
            <label>Permit Number</label>
            <input
              value={form.permit_number}
              onChange={(e) => setForm((f) => ({ ...f, permit_number: e.target.value }))}
              disabled={saving}
            />
          </div>
        </div>

        <div className="permits-field">
          <label>Issuing Authority</label>
          <input
            value={form.issuing_authority}
            onChange={(e) => setForm((f) => ({ ...f, issuing_authority: e.target.value }))}
            disabled={saving}
          />
        </div>

        <div className="permits-form-row">
          <div className="permits-field">
            <label>Issue Date</label>
            <input
              type="date"
              value={form.issue_date}
              onChange={(e) => setForm((f) => ({ ...f, issue_date: e.target.value }))}
              disabled={saving}
            />
          </div>
          <div className="permits-field">
            <label>Expiration Date</label>
            <input
              type="date"
              value={form.expiration_date}
              onChange={(e) => setForm((f) => ({ ...f, expiration_date: e.target.value }))}
              required
              disabled={saving}
            />
          </div>
        </div>

        <div className="permits-field">
          <label>Attached File {isEdit && permit?.document_id ? '(choose a file to replace the current one)' : '(optional)'}</label>
          <input
            type="file"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            disabled={saving}
          />
        </div>

        <div className="permits-field">
          <label>Notes</label>
          <textarea
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            rows={3}
            disabled={saving}
          />
        </div>

        {error && <div className="permits-error">{error}</div>}
        <div className="permits-form-actions">
          <button type="button" className="permits-btn-secondary" onClick={onCancel} disabled={saving}>Cancel</button>
          <button type="submit" className="permits-btn-primary" disabled={saving}>
            {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Add permit'}
          </button>
        </div>
      </form>
    </div>
  );
}
