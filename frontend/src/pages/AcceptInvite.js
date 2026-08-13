import React, { useState } from 'react';
import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

export default function AcceptInvite() {
  const [password, setPassword]       = useState('');
  const [confirm, setConfirm]         = useState('');
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState('');
  const [success, setSuccess]         = useState(false);

  const token = new URLSearchParams(window.location.search).get('token');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    setLoading(true); setError('');
    try {
      const res = await axios.post(`${API_BASE_URL}/api/auth/accept-invite`, { token, password });
      setSuccess(true);
      // Auto-login: the accept-invite response is the same request/response
      // that just committed the password + role, so there's no race here —
      // storing its userId and doing a full navigation to /dashboard lets
      // App.js's normal mount flow fetch a fresh /api/auth/me for this user
      // (it also redirects accountant accounts on to /accountant on its
      // own), so the very next page always reflects the just-created role
      // with no manual "sign in again" step required.
      localStorage.setItem('constructmail_userId', res.data.userId);
      window.location.href = '/dashboard';
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to accept invite.');
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div style={{ padding: '80px 24px', textAlign: 'center' }}>
        <p style={{ color: '#DC2626' }}>Invalid invite link. Please ask your company owner to resend it.</p>
        <a href="/login" style={{ color: '#D97706', fontWeight: 600 }}>Back to sign in</a>
      </div>
    );
  }

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-logo">
          <svg width="32" height="32" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
            <circle cx="50" cy="50" r="32" fill="none" stroke="#0E1B2C" strokeWidth="7"/>
            <circle cx="50" cy="50" r="18" fill="none" stroke="#D97706" strokeWidth="3"/>
            <circle cx="50" cy="50" r="5" fill="#D97706"/>
          </svg>
          <span className="auth-logo-name">POMAR</span>
        </div>

        <h3 className="auth-forgot-title">Set your password</h3>

        {success ? (
          <div>
            <div className="auth-success" style={{ marginBottom: 20 }}>
              Password set! Signing you in...
            </div>
            {/* Fallback only — the submit handler already redirects on success. */}
            <a href="/login" className="auth-submit" style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}>
              Sign in now
            </a>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="auth-form">
            <div className="auth-field">
              <label className="auth-label">Password</label>
              <input
                type="password"
                className="auth-input"
                placeholder="Min. 8 characters"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                disabled={loading}
              />
            </div>
            <div className="auth-field">
              <label className="auth-label">Confirm Password</label>
              <input
                type="password"
                className="auth-input"
                placeholder="Repeat password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                required
                disabled={loading}
              />
            </div>
            {error && <div className="auth-error">{error}</div>}
            <button type="submit" className="auth-submit" disabled={loading}>
              {loading ? 'Setting password...' : 'Set Password'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
