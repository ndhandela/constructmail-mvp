import React, { useState, useEffect, useRef } from 'react';
import { API_BASE_URL } from '../dailyLogsUtils';

export default function InviteVendorModal({ userId, project, onInvited, onCancel }) {
  const [mode, setMode] = useState('search'); // 'search' | 'manual'
  const [directoryAvailable, setDirectoryAvailable] = useState(true);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const debounceRef = useRef(null);

  useEffect(() => {
    if (mode !== 'search' || !query.trim()) {
      setResults([]);
      return;
    }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`${API_BASE_URL}/api/vendors?userId=${userId}&search=${encodeURIComponent(query.trim())}`);
        if (res.status === 403) {
          // Company doesn't have the separate Vendors-directory module
          // licensed — this feature must not require that, so just fall
          // back to manual entry instead of surfacing an error.
          setDirectoryAvailable(false);
          setMode('manual');
          return;
        }
        const data = await res.json();
        if (data.success) setResults(data.vendors || []);
      } catch (err) {
        console.error('Search vendors error:', err);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [query, mode, userId]);

  const selectVendor = (vendor) => {
    if (vendor.email) setEmail(vendor.email);
    if (vendor.trade) setRole(vendor.trade);
    setMode('manual');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE_URL}/api/project-vendors/projects/${project.id}/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: Number(userId),
          email: email.trim(),
          role: role.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.detail || 'Could not send invite.');
        return;
      }
      onInvited();
    } catch (err) {
      setError('Network error. Try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="dailylogs-modal-overlay" onClick={onCancel}>
      <form className="dailylogs-modal" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <h3>Invite vendor</h3>

        {directoryAvailable && (
          <div className="dailylogs-invite-mode-toggle">
            <button
              type="button"
              className={`dailylogs-tab${mode === 'search' ? ' dailylogs-tab-active' : ''}`}
              onClick={() => setMode('search')}
            >
              Search vendor directory
            </button>
            <button
              type="button"
              className={`dailylogs-tab${mode === 'manual' ? ' dailylogs-tab-active' : ''}`}
              onClick={() => setMode('manual')}
            >
              Enter email
            </button>
          </div>
        )}

        {mode === 'search' ? (
          <div className="dailylogs-field">
            <label>Search your vendors</label>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Name or trade…"
              autoFocus
            />
            {searching && <p className="dailylogs-muted">Searching…</p>}
            {results.length > 0 && (
              <div className="dailylogs-vendor-search-results">
                {results.map((vendor) => (
                  <button
                    type="button"
                    key={vendor.id}
                    className="dailylogs-vendor-search-result"
                    onClick={() => selectVendor(vendor)}
                  >
                    <strong>{vendor.name}</strong> — {vendor.trade}
                    {vendor.email ? ` (${vendor.email})` : ''}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="dailylogs-field">
              <label>Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="sub@example.com"
                required
                disabled={saving}
              />
            </div>
            <div className="dailylogs-field">
              <label>Trade / role (optional)</label>
              <input
                value={role}
                onChange={(e) => setRole(e.target.value)}
                placeholder="e.g. Electrical"
                disabled={saving}
              />
            </div>
          </>
        )}

        {error && <div className="dailylogs-error">{error}</div>}
        <div className="dailylogs-form-actions">
          <button type="button" className="dailylogs-btn-secondary" onClick={onCancel} disabled={saving}>Cancel</button>
          <button type="submit" className="dailylogs-btn-primary" disabled={saving || !email.trim()}>
            {saving ? 'Sending…' : 'Send invite'}
          </button>
        </div>
      </form>
    </div>
  );
}
