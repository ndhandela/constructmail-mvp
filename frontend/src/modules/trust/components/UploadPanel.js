import React, { useState } from 'react';
import { API_BASE_URL } from '../trustUtils';

export default function UploadPanel({ userId, projectId, onUploaded }) {
  const [uploadType, setUploadType] = useState('whatsapp');
  const [file, setFile] = useState(null);
  const [pastedText, setPastedText] = useState('');
  const [useTextPaste, setUseTextPaste] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file && !pastedText.trim()) {
      setError('Attach a file or paste the thread text.');
      return;
    }
    setUploading(true);
    setError('');
    setResult(null);
    try {
      const formData = new FormData();
      formData.append('userId', String(userId));
      formData.append('upload_type', uploadType);
      if (file) formData.append('file', file);
      if (useTextPaste && pastedText.trim()) formData.append('pasted_text', pastedText.trim());

      const res = await fetch(`${API_BASE_URL}/api/trust/projects/${projectId}/uploads`, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.detail || 'Upload failed.');
        return;
      }
      setResult(data);
      setFile(null);
      setPastedText('');
      onUploaded();
    } catch (err) {
      setError('Network error. Try again.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <form className="trust-upload-panel" onSubmit={handleSubmit}>
      <div className="trust-upload-type-toggle">
        <button
          type="button"
          className={`trust-toggle-btn ${uploadType === 'whatsapp' ? 'active' : ''}`}
          onClick={() => { setUploadType('whatsapp'); setUseTextPaste(false); setFile(null); }}
        >
          WhatsApp export (.txt)
        </button>
        <button
          type="button"
          className={`trust-toggle-btn ${uploadType === 'email' ? 'active' : ''}`}
          onClick={() => setUploadType('email')}
        >
          Email thread (.eml or pasted text)
        </button>
      </div>

      {uploadType === 'email' && (
        <div className="trust-upload-source-toggle">
          <label>
            <input type="radio" checked={!useTextPaste} onChange={() => setUseTextPaste(false)} /> Upload .eml file
          </label>
          <label>
            <input type="radio" checked={useTextPaste} onChange={() => setUseTextPaste(true)} /> Paste plain text
          </label>
        </div>
      )}

      {useTextPaste ? (
        <textarea
          className="trust-upload-textarea"
          placeholder="Paste the email thread text here…"
          value={pastedText}
          onChange={(e) => setPastedText(e.target.value)}
          rows={6}
        />
      ) : (
        <input
          type="file"
          accept={uploadType === 'whatsapp' ? '.txt' : '.eml,.txt'}
          onChange={(e) => setFile(e.target.files?.[0] || null)}
        />
      )}

      {error && <div className="trust-error">{error}</div>}
      {result && (
        <div className="trust-success">
          Upload {result.parse_status === 'parsed' ? 'parsed' : result.parse_status} — {result.extraction_count} extraction(s) found.
        </div>
      )}

      <button type="submit" className="trust-btn-primary" disabled={uploading}>
        {uploading ? 'Uploading & parsing…' : 'Upload & parse'}
      </button>
    </form>
  );
}
