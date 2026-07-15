import React, { useState } from 'react';
import axios from 'axios';
import './styles/Auth.css';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

const PRODUCT_NAMES = {
  '/clash':         'POMAR Clash — BIM Clash Analyzer',
  '/constructmail': 'POMAR Mail — Email Intelligence',
};

export const ROLES = [
  { value: '',              label: 'Select your role...' },
  { value: 'GC',            label: 'General Contractor' },
  { value: 'Subcontractor', label: 'Subcontractor' },
  { value: 'Owner',         label: 'Owner / Owner Rep' },
  { value: 'VDC',           label: 'VDC / BIM Coordinator' },
  { value: 'Other',         label: 'Other' },
];

export default function Auth({ onLoginSuccess, defaultMode = 'login' }) {
  const [mode, setMode]               = useState(defaultMode);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState('');

  // Register
  const [fullName, setFullName]       = useState('');
  const [email, setEmail]             = useState('');
  const [company, setCompany]         = useState('');
  const [role, setRole]               = useState('');
  const [password, setPassword]       = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Login
  const [loginEmail, setLoginEmail]   = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);

  // Forgot password
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotSent, setForgotSent]   = useState(false);

  const postLoginPath = sessionStorage.getItem('postLoginPath') || '';
  const productName   = PRODUCT_NAMES[postLoginPath] || null;

  const resetForm = () => { setError(''); };
  const switchMode = (m) => { resetForm(); setMode(m); };

  const handleRegister = async (e) => {
    e.preventDefault();
    if (!role)                          { setError('Please select your role.'); return; }
    if (password.length < 8)           { setError('Password must be at least 8 characters.'); return; }
    if (password !== confirmPassword)  { setError('Passwords do not match.'); return; }
    setLoading(true); setError('');
    try {
      const res = await axios.post(`${API_BASE_URL}/api/auth/register`, {
        fullName, email, company, role, password,
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
    setLoading(true); setError('');
    try {
      const res = await axios.post(`${API_BASE_URL}/api/auth/login`, {
        email: loginEmail, password: loginPassword,
      });
      if (res.data.success) {
        if (onLoginSuccess) onLoginSuccess(res.data.userId);
        const dest = sessionStorage.getItem('postLoginPath') || '/dashboard';
        sessionStorage.removeItem('postLoginPath');
        window.location.href = dest;
      } else {
        setError(res.data.error || 'Login failed.');
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Invalid email or password.');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      await axios.post(`${API_BASE_URL}/api/auth/forgot-password`, { email: forgotEmail });
      setForgotSent(true);
    } catch {
      setError('Failed to send reset email. Please try again.');
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

        {mode !== 'forgot' && (
          <div className="auth-toggle">
            <button className={`auth-toggle-btn ${mode === 'register' ? 'active' : ''}`} onClick={() => switchMode('register')} type="button">
              Create account
            </button>
            <button className={`auth-toggle-btn ${mode === 'login' ? 'active' : ''}`} onClick={() => switchMode('login')} type="button">
              Sign in
            </button>
          </div>
        )}

        {/* ── REGISTER ── */}
        {mode === 'register' && (
          <div>
            <p className="auth-sub">Free access — no credit card needed.</p>
            <form onSubmit={handleRegister} className="auth-form">
              <div className="auth-field">
                <label className="auth-label">Full Name</label>
                <input type="text" className="auth-input" placeholder="John Smith" value={fullName} onChange={e => setFullName(e.target.value)} required disabled={loading} />
              </div>
              <div className="auth-field">
                <label className="auth-label">Work Email</label>
                <input type="email" className="auth-input" placeholder="john@yourcompany.com" value={email} onChange={e => setEmail(e.target.value)} required disabled={loading} />
              </div>
              <div className="auth-field">
                <label className="auth-label">Company Name</label>
                <input type="text" className="auth-input" placeholder="Smith Construction Co." value={company} onChange={e => setCompany(e.target.value)} required disabled={loading} />
              </div>
              <div className="auth-field">
                <label className="auth-label">Your Role</label>
                <select className="auth-input auth-select" value={role} onChange={e => setRole(e.target.value)} disabled={loading}>
                  {ROLES.map(r => <option key={r.value} value={r.value} disabled={r.value === ''}>{r.label}</option>)}
                </select>
              </div>
              <div className="auth-field">
                <label className="auth-label">Password</label>
                <div className="auth-password-wrap">
                  <input type={showPassword ? 'text' : 'password'} className="auth-input" placeholder="Min. 8 characters" value={password} onChange={e => setPassword(e.target.value)} required disabled={loading} />
                  <button type="button" className="auth-toggle-pw" onClick={() => setShowPassword(!showPassword)}>{showPassword ? 'Hide' : 'Show'}</button>
                </div>
              </div>
              <div className="auth-field">
                <label className="auth-label">Confirm Password</label>
                <input type={showPassword ? 'text' : 'password'} className="auth-input" placeholder="Repeat password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required disabled={loading} />
              </div>
              {error && <div className="auth-error">{error}</div>}
              <button type="submit" className="auth-submit" disabled={loading}>{loading ? 'Creating account...' : 'Get Free Access'}</button>
            </form>
            <p className="auth-switch">Already have an account? <button type="button" onClick={() => switchMode('login')}>Sign in</button></p>
          </div>
        )}

        {/* ── LOGIN ── */}
        {mode === 'login' && (
          <div>
            <form onSubmit={handleLogin} className="auth-form">
              <div className="auth-field">
                <label className="auth-label">Work Email</label>
                <input type="email" className="auth-input" placeholder="john@yourcompany.com" value={loginEmail} onChange={e => setLoginEmail(e.target.value)} required disabled={loading} />
              </div>
              <div className="auth-field">
                <label className="auth-label">Password</label>
                <div className="auth-password-wrap">
                  <input type={showLoginPassword ? 'text' : 'password'} className="auth-input" placeholder="Your password" value={loginPassword} onChange={e => setLoginPassword(e.target.value)} required disabled={loading} />
                  <button type="button" className="auth-toggle-pw" onClick={() => setShowLoginPassword(!showLoginPassword)}>{showLoginPassword ? 'Hide' : 'Show'}</button>
                </div>
              </div>
              {error && <div className="auth-error">{error}</div>}
              <button type="submit" className="auth-submit" disabled={loading}>{loading ? 'Signing in...' : 'Sign In'}</button>
            </form>
            <p className="auth-switch">
              <button type="button" onClick={() => switchMode('forgot')}>Forgot password?</button>
              {' · '}
              New to POMAR? <button type="button" onClick={() => switchMode('register')}>Create a free account</button>
            </p>
          </div>
        )}

        {/* ── FORGOT PASSWORD ── */}
        {mode === 'forgot' && (
          <div>
            <h3 className="auth-forgot-title">Reset your password</h3>
            <p className="auth-sub">Enter your email and we'll send you a reset link.</p>
            {forgotSent ? (
              <div className="auth-success">
                Check your email — a reset link has been sent if an account exists.
              </div>
            ) : (
              <form onSubmit={handleForgotPassword} className="auth-form">
                <div className="auth-field">
                  <label className="auth-label">Work Email</label>
                  <input type="email" className="auth-input" placeholder="john@yourcompany.com" value={forgotEmail} onChange={e => setForgotEmail(e.target.value)} required disabled={loading} />
                </div>
                {error && <div className="auth-error">{error}</div>}
                <button type="submit" className="auth-submit" disabled={loading}>{loading ? 'Sending...' : 'Send Reset Link'}</button>
              </form>
            )}
            <p className="auth-switch"><button type="button" onClick={() => switchMode('login')}>← Back to sign in</button></p>
          </div>
        )}

      </div>
    </div>
  );
}
