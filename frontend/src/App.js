import React, { useState, useEffect } from 'react';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import Summarizer from './components/Summarizer';
import ActionExtractor from './components/ActionExtractor';
import MeetingNotes from './components/MeetingNotes';
import SignalDetector from './components/SignalDetector';
import './theme.css';
import './styles/components.css';
import './App.css';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [userId, setUserId] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

useEffect(() => {
  const verifyTokenFn = async (token) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/verify-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token })
      });

      const data = await response.json();

      if (data.success) {
        setUserId(data.userId);
        localStorage.setItem('constructmail_userId', data.userId);
        fetchUser(data.userId);
        window.history.replaceState({}, document.title, window.location.pathname);
      } else {
        alert('Login failed: ' + data.error);
        setLoading(false);
      }
    } catch (err) {
      console.error('Token verification error:', err);
      alert('Login failed: ' + err.message);
      setLoading(false);
    }
  };

  // Check if user is already logged in (from URL or localStorage)
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');
  const savedUserId = localStorage.getItem('constructmail_userId');

  if (token) {
    verifyTokenFn(token);
  } else if (savedUserId) {
    setUserId(savedUserId);
    fetchUser(savedUserId);
  } else {
    setLoading(false);
  }
}, []);



  const fetchUser = async (uid) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/me?userId=${uid}`);
      const data = await response.json();
      setUser(data);
      setLoading(false);
    } catch (err) {
      console.error('Fetch user error:', err);
      setLoading(false);
    }
  };

  const handleLogout = () => {
    setUserId(null);
    setUser(null);
    localStorage.removeItem('constructmail_userId');
    setActiveTab('dashboard');
  };

  if (loading) {
    return <div style={{ padding: '50px', textAlign: 'center' }}>Loading...</div>;
  }

  if (!userId) {
    return <Login onLoginSuccess={() => {}} />;
  }

  return (
    <div className="App">
      <header className="header">
        <div className="header-content">
          <img src="/logos/constructmail.png" alt="ConstructMail" className="logo-constructmail" />
          <div className="header-center">
            <p className="header-subtitle">AI-powered email intelligence for General Contractors</p>
            <p style={{ margin: '0', fontSize: '12px', color: '#999' }}>Logged in as: {user?.email}</p>
          </div>
        </div>
        <div style={{ textAlign: 'right', paddingRight: '20px', marginTop: '10px' }}>
          <button onClick={handleLogout} style={{
            padding: '10px 20px',
            background: 'var(--secondary-color)',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: '600'
          }}>
            🚪 Logout
          </button>
        </div>
        <nav className="nav-tabs">
          <button
            className={`nav-tab ${activeTab === 'dashboard' ? 'active' : ''}`}
            onClick={() => setActiveTab('dashboard')}
          >
            📊 Dashboard
          </button>
          <button
            className={`nav-tab ${activeTab === 'summarizer' ? 'active' : ''}`}
            onClick={() => setActiveTab('summarizer')}
          >
            📋 Summarizer
          </button>
          <button
            className={`nav-tab ${activeTab === 'actions' ? 'active' : ''}`}
            onClick={() => setActiveTab('actions')}
          >
            ✓ Actions
          </button>
          <button
            className={`nav-tab ${activeTab === 'meeting' ? 'active' : ''}`}
            onClick={() => setActiveTab('meeting')}
          >
            👥 Meeting Notes
          </button>
          <button
            className={`nav-tab ${activeTab === 'signals' ? 'active' : ''}`}
            onClick={() => setActiveTab('signals')}
          >
            🚨 RFI/Change Orders
          </button>
        </nav>
      </header>

      <div className="tab-content">
        {activeTab === 'dashboard' && <Dashboard />}
        {activeTab === 'summarizer' && <Summarizer />}
        {activeTab === 'actions' && <ActionExtractor />}
        {activeTab === 'meeting' && <MeetingNotes />}
        {activeTab === 'signals' && <SignalDetector />}
      </div>
    </div>
  );
}

export default App;