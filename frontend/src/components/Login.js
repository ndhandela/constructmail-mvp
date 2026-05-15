import React, { useState } from 'react';
import axios from 'axios';
import '../styles/Login.css';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

export default function Login({ onLoginSuccess }) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [magicLink, setMagicLink] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');
    setMagicLink('');

    try {
      const response = await axios.post(`${API_BASE_URL}/api/auth/send-magic-link`, { email });
      setMessage('✅ Magic link generated!');
      setMagicLink(response.data.magicLink);
      setEmail('');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to send magic link');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <h2>
          <svg width="28" height="28" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" style={{display: 'inline-block', marginRight: '8px', verticalAlign: 'middle'}}>
            <circle cx="50" cy="50" r="32" fill="none" stroke="#0E1B2C" strokeWidth="7"/>
            <circle cx="50" cy="50" r="18" fill="none" stroke="#D97706" strokeWidth="3"/>
            <circle cx="50" cy="50" r="5" fill="#D97706"/>
          </svg>
          ConstructMail
        </h2>
        <p>AI-powered email intelligence for General Contractors</p>
        
        <form onSubmit={handleSubmit}>
          <input
            type="email"
            placeholder="Enter your email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={loading}
          />
          <button type="submit" disabled={loading}>
            {loading ? 'Sending...' : 'Get Access Link'}
          </button>
        </form>

        {message && (
        <div className="success">
            {message}
            {magicLink && (
            <div className="magic-link-section">
                <p className="link-label">Your ConstructMail link:</p>
                <a href={magicLink} className="magic-link" target="_blank" rel="noopener noreferrer">
                Click here to login
                </a>
                <p className="link-note">Or copy and paste this link:</p>
                <div className="link-box">{magicLink}</div>
            </div>
            )}
        </div>
        )}
        
        {error && <div className="error">{error}</div>}

        <p className="info">
          We'll send you a magic link to login. No password needed.
        </p>
      </div>
    </div>
  );
}