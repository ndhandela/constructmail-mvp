import React, { useState } from 'react';
import axios from 'axios';
import { ROLES } from './Auth';
import './styles/Auth.css';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

export default function SelectRole({ userId, onRoleSelected }) {
  const [role, setRole] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!role) {
      setError('Please select your role.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await axios.patch(`${API_BASE_URL}/api/auth/role`, { userId: Number(userId), role });
      onRoleSelected(role);
    } catch (err) {
      setError(err.response?.data?.detail || 'Could not save your role. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-logo">
          <span className="auth-logo-name">POMAR</span>
        </div>

        <p className="auth-sub">One more thing — what's your role on a project?</p>

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="auth-field">
            <label className="auth-label">Your Role</label>
            <select className="auth-input auth-select" value={role} onChange={(e) => setRole(e.target.value)} disabled={loading}>
              {ROLES.map((r) => (
                <option key={r.value} value={r.value} disabled={r.value === ''}>{r.label}</option>
              ))}
            </select>
          </div>

          {error && <div className="auth-error">{error}</div>}

          <button type="submit" className="auth-submit" disabled={loading}>
            {loading ? 'Saving...' : 'Continue'}
          </button>
        </form>
      </div>
    </div>
  );
}
