import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import '../styles/Header.css';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

export default function NewProjectModal({ userId, onClose, onCreated }) {
  const [name, setName] = useState('');
  const [projectNumber, setProjectNumber] = useState('');
  const [clientName, setClientName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Project name is required');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE_URL}/api/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: Number(userId),
          name: name.trim(),
          project_number: projectNumber.trim() || null,
          client_name: clientName.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.detail || 'Could not create project');
        return;
      }
      onCreated(data.project);
    } catch (err) {
      console.error('Create project error:', err);
      setError('Could not reach the server. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div className="new-project-overlay" onClick={onClose}>
      <div
        className="new-project-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="New project"
      >
        <div className="new-project-header">
          <h3>New project</h3>
          <button className="new-project-close-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="new-project-field">
            <label className="new-project-label" htmlFor="np-name">Project name *</label>
            <input
              id="np-name"
              className="new-project-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Riverside Tower"
              autoFocus
            />
          </div>

          <div className="new-project-field">
            <label className="new-project-label" htmlFor="np-number">Project number</label>
            <input
              id="np-number"
              className="new-project-input"
              value={projectNumber}
              onChange={(e) => setProjectNumber(e.target.value)}
              placeholder="e.g. PN-2026-014"
            />
          </div>

          <div className="new-project-field">
            <label className="new-project-label" htmlFor="np-client">Client name</label>
            <input
              id="np-client"
              className="new-project-input"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              placeholder="e.g. Acme Development"
            />
          </div>

          {error && <p className="new-project-error">{error}</p>}

          <div className="new-project-actions">
            <button type="button" className="new-project-btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="new-project-btn-primary" disabled={saving}>
              {saving ? 'Creating…' : 'Create project'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
