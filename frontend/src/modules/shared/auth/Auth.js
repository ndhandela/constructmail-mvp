import React, { useState } from 'react';
import axios from 'axios';
import './styles/Auth.css';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

const PRODUCT_NAMES = {
  '/clash':         'POMAR Clash — BIM Clash Analyzer',
  '/constructmail': 'POMAR Mail — Email Intelligence',
};

const ROLES = [
  { value: '',              label: 'Select your role...' },
  { value: 'GC',            label: 'General Contractor' },
  { value: 'Subcontractor', label: 'Subcontractor' },
  { value: 'Owner',         label: 'Owner / Owner Rep' },
  { value: 'VDC',           label: 'VDC / BIM Coordinator' },
  { value: 'Other',         label: 'Other' },
];

export default function Auth({ onLoginSuccess, defaultMode = 'register' }) {
  const [mode, setMode]             = useState(defaultMode);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState('');
  const [success, setSuccess]       = useState('');
  const [fullName, setFullName]     = useState('');
  const [email, setEmail]           = useState('');
  const [company, setCompany]       = useState('');
  const [role, setRole]             = useState('');
  const [loginEmail, setLoginEmail] = useState('');
  const [magicLink, setMagicLink]   = useState('');

  const postLoginPath = sessionStorage.getItem('postLoginPath') || '';
  const productName   = PRODUCT_NAMES[postLoginPath] || null;

  const resetForm = () => {
    setError('');
    setSuccess('');
    setMagicLink('');
  };

  const switchMode = (newMode) => {
    resetForm();
    setMode(newMode);
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    if (!role) { setError('Please select your role.'); return; }
    setLoading(true);
    setError('');
    try {
      const res = await axios.post(`${API_BASE_URL}/api/auth/register`, {
        fullName, email, company, role,
      });
      if (res.data.success) {
        if (onLoginSuccess) onLoginSuccess(res.data.userId);
        const dest = sessionStorage.getItem('postLoginPath') || '/dashboard';
        sessionStorage.removeItem('postLoginPath');
        window.location.href = dest;
      } else {
        setError(res.data.error || 'Registration failed.');
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');
    setMagicLink('');
    try {
      const res = await axios.post(`${API_BASE_URL}/api/auth/send-magic-link`, {
        email: loginEmail,
      });
      setSuccess('Access link generated!');
      setMagicLink(res.data.magicLink);
      setLoginEmail('');
    } catch (err) {
      setError(err.response?.data?.error || 'Could not send access link.');
    } finally {
      setLoading(false);
    }
  };

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

        {productName && (
          <div className="auth-context-banner">
            <span>🔒</span>
            <div>
              <p className="auth-context-title">Sign in to access</p>
              <p className="auth-context-product">{productName}</p>
            </div>
          </div>
        )}

        <div className="auth-toggle">
          <button
            className={`auth-toggle-btn ${mode === 'register' ? 'active' : ''}`}
            onClick={() => switchMode('register')}
            type="button"
          >
            Create account
          </button>
          <button
            className={`auth-toggle-btn ${mode === 'login' ? 'active' : ''}`}
            onClick={() => switchMode('login')}
            type="button"
          >
            Sign in
          </button>
        </div>

        {mode === 'register' && (
          <div>
            <p className="auth-sub">Free access — no credit card needed.</p>
            <form onSubmit={handleRegister} className="auth-form">
              <div className="auth-field">
                <label className="auth-label">Full Name</label>
                <input
                  type="text"
                  className="auth-input"
                  placeholder="John Smith"
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  required
                  disabled={loading}
                />
              </div>
              <div className="auth-field">
                <label className="auth-label">Work Email</label>
                <input
                  type="email"
                  className="auth-input"
                  placeholder="john@yourcompany.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  disabled={loading}
                />
              </div>
              <div className="auth-field">
                <label className="auth-label">Company Name</label>
                <input
                  type="text"
                  className="auth-input"
                  placeholder="Smith Construction Co."
                  value={company}
                  onChange={e => setCompany(e.target.value)}
                  required
                  disabled={loading}
                />
              </div>
              <div className="auth-field">
                <label className="auth-label">Your Role</label>
                <select
                  className="auth-input auth-select"
                  value={role}
                  onChange={e => setRole(e.target.value)}
                  disabled={loading}
                >
                  {ROLES.map(r => (
                    <option key={r.value} value={r.value} disabled={r.value === ''}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>
              {error && <div className="auth-error">{error}</div>}
              <button type="submit" className="auth-submit" disabled={loading}>
                {loading ? 'Creating account...' : 'Get Free Access'}
              </button>
            </form>
            <p className="auth-switch">
              Already have an account?{' '}
              <button type="button" onClick={() => switchMode('login')}>Sign in</button>
            </p>
          </div>
        )}

        {mode === 'login' && (
          <div>
            <p className="auth-sub">Enter your email and we'll send you an instant access link.</p>
            <form onSubmit={handleLogin} className="auth-form">
              <div className="auth-field">
                <label className="auth-label">Work Email</label>
                <input
                  type="email"
                  className="auth-input"
                  placeholder="john@yourcompany.com"
                  value={loginEmail}
                  onChange={e => setLoginEmail(e.target.value)}
                  required
                  disabled={loading}
                />
              </div>
              {error && <div className="auth-error">{error}</div>}
              {success && !magicLink && (
                <div className="auth-success">{success}</div>
              )}
              {magicLink && (
                <div className="auth-magic-box">
                  <p className="auth-magic-label">Your access link is ready:</p>
                  <a
                  
                    href={magicLink}
                    className="auth-magic-link"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Click here to sign in
                  </a>
                  <p className="auth-magic-note">Or copy this link:</p>
                  <div className="auth-magic-url">{magicLink}</div>
                </div>
              )}
              <button type="submit" className="auth-submit" disabled={loading}>
                {loading ? 'Sending...' : 'Send Access Link'}
              </button>
            </form>
            <p className="auth-switch">
              New to POMAR?{' '}
              <button type="button" onClick={() => switchMode('register')}>Create a free account</button>
            </p>
          </div>
        )}

      </div>
    </div>
  );
}
