import React, { useCallback, useEffect, useState } from 'react';
import { API_BASE_URL } from '../permitsUtils';

// GC-only threshold configuration — GET/PUT/DELETE
// /api/permits/projects/{project_id}/settings(...). Each permit_type shown
// is either using the project-wide default_expiring_soon_days (is_custom
// false) or has its own override (is_custom true); editing a row upserts an
// override, "Use default" removes it (routers/permits.py's DELETE
// .../settings/{permit_type}).
export default function PermitSettingsModal({ userId, projectId, onClose }) {
  const [defaultDays, setDefaultDays] = useState('');
  const [savingDefault, setSavingDefault] = useState(false);
  const [settings, setSettings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editingType, setEditingType] = useState(null);
  const [editingValue, setEditingValue] = useState('');
  const [busyType, setBusyType] = useState(null);

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE_URL}/api/permits/projects/${projectId}/settings?userId=${userId}`);
      const data = await res.json();
      if (data.success) {
        setDefaultDays(String(data.default_expiring_soon_days));
        setSettings(data.permit_type_settings || []);
      } else {
        setError(data.detail || 'Could not load permit settings.');
      }
    } catch (err) {
      console.error('Fetch permit settings error:', err);
      setError('Network error. Try again.');
    } finally {
      setLoading(false);
    }
  }, [projectId, userId]);

  useEffect(() => { fetchSettings(); }, [fetchSettings]);

  const handleSaveDefault = async () => {
    const days = Number(defaultDays);
    if (!Number.isInteger(days) || days < 0) { setError('Default window must be a whole number of days.'); return; }
    setSavingDefault(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE_URL}/api/permits/projects/${projectId}/default-expiring-soon-days`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: Number(userId), default_expiring_soon_days: days }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.detail || 'Could not save the default window.'); return; }
      fetchSettings();
    } catch (err) {
      console.error('Save default expiring-soon window error:', err);
      setError('Network error. Try again.');
    } finally {
      setSavingDefault(false);
    }
  };

  const startEdit = (setting) => {
    setEditingType(setting.permit_type);
    setEditingValue(String(setting.expiring_soon_days));
  };

  const handleSaveOverride = async (permitType) => {
    const days = Number(editingValue);
    if (!Number.isInteger(days) || days < 0) { setError('Window must be a whole number of days.'); return; }
    setBusyType(permitType);
    setError('');
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/permits/projects/${projectId}/settings/${encodeURIComponent(permitType)}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: Number(userId), expiring_soon_days: days }),
        },
      );
      const data = await res.json();
      if (!res.ok) { setError(data.detail || 'Could not save that threshold.'); return; }
      setEditingType(null);
      fetchSettings();
    } catch (err) {
      console.error('Save permit type setting error:', err);
      setError('Network error. Try again.');
    } finally {
      setBusyType(null);
    }
  };

  const handleResetOverride = async (permitType) => {
    setBusyType(permitType);
    setError('');
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/permits/projects/${projectId}/settings/${encodeURIComponent(permitType)}?userId=${userId}`,
        { method: 'DELETE' },
      );
      const data = await res.json();
      if (!res.ok) { setError(data.detail || 'Could not reset that threshold.'); return; }
      fetchSettings();
    } catch (err) {
      console.error('Reset permit type setting error:', err);
      setError('Network error. Try again.');
    } finally {
      setBusyType(null);
    }
  };

  return (
    <div className="permits-modal-overlay" onClick={onClose}>
      <div className="permits-modal" onClick={(e) => e.stopPropagation()}>
        <h3>Expiring-soon settings</h3>

        <div className="permits-field">
          <label>Project default window (days before expiration)</label>
          <div className="permits-grant-row">
            <input
              type="number"
              min="0"
              step="1"
              value={defaultDays}
              onChange={(e) => setDefaultDays(e.target.value)}
              disabled={savingDefault || loading}
            />
            <button
              type="button"
              className="permits-btn-primary"
              onClick={handleSaveDefault}
              disabled={savingDefault || loading}
            >
              {savingDefault ? 'Saving…' : 'Save'}
            </button>
          </div>
          <p className="permits-muted">Used for any permit type without its own custom window below.</p>
        </div>

        <div className="permits-field">
          <label>Per permit-type overrides</label>
          {loading ? (
            <p className="permits-muted">Loading…</p>
          ) : settings.length === 0 ? (
            <p className="permits-muted">No permit types on this project yet.</p>
          ) : (
            <ul className="permits-settings-list">
              {settings.map((s) => (
                <li key={s.permit_type}>
                  <div className="permits-settings-row-label">
                    <span>{s.permit_type}</span>
                    {s.is_custom ? (
                      <span className="permits-settings-tag permits-settings-tag-custom">Custom</span>
                    ) : (
                      <span className="permits-settings-tag">Using default</span>
                    )}
                  </div>
                  {editingType === s.permit_type ? (
                    <div className="permits-grant-row">
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={editingValue}
                        onChange={(e) => setEditingValue(e.target.value)}
                        disabled={busyType === s.permit_type}
                      />
                      <button
                        type="button"
                        className="permits-btn-primary"
                        onClick={() => handleSaveOverride(s.permit_type)}
                        disabled={busyType === s.permit_type}
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        className="permits-btn-secondary"
                        onClick={() => setEditingType(null)}
                        disabled={busyType === s.permit_type}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="permits-settings-row-value">
                      <span>{s.expiring_soon_days} days</span>
                      <button type="button" className="permits-link-btn" onClick={() => startEdit(s)}>Edit</button>
                      {s.is_custom && (
                        <button
                          type="button"
                          className="permits-link-btn"
                          onClick={() => handleResetOverride(s.permit_type)}
                          disabled={busyType === s.permit_type}
                        >
                          Use default
                        </button>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {error && <div className="permits-error">{error}</div>}
        <div className="permits-form-actions">
          <button type="button" className="permits-btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
