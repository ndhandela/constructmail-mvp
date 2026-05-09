import React, { useState } from 'react';
import Dashboard from '../components/Dashboard';
import Summarizer from '../components/Summarizer';
import ActionExtractor from '../components/ActionExtractor';
import MeetingNotes from '../components/MeetingNotes';
import SignalDetector from '../components/SignalDetector';
import GmailConnect from '../components/GmailConnect';
import GmailInbox from '../components/GmailInbox';
import '../theme.css';
import '../styles/components.css';

export default function ConstructMailApp({ user, userId, onLogout }) {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [gmailConnected, setGmailConnected] = useState(false);
  const [selectedEmailText, setSelectedEmailText] = useState('');

  const handleEmailSelect = (thread) => {
    setSelectedEmailText(thread);
  };

  return (
    <div className="App">
      <header className="header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative' }}>
          <img src="/logos/pomar.png" alt="pomar" style={{ height: '120px', width: 'auto' }} />
          <div style={{ textAlign: 'center', flex: 1 }}>
            <img src="/logos/constructmail.png" alt="ConstructMail" style={{ height: '75px', width: 'auto', marginBottom: '8px' }} />
            <p className="header-subtitle">AI-powered email intelligence for General Contractors</p>
            <p style={{ margin: '0', fontSize: '12px', color: '#999' }}>Logged in as: {user?.email}</p>
          </div>
          <button onClick={onLogout} style={{
            padding: '10px 20px',
            background: 'var(--secondary-color)',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: '600',
            whiteSpace: 'nowrap'
          }}>
            🚪 Logout
          </button>
        </div>
      </header>

      <nav className="nav-tabs">
        <button className={`nav-tab ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveTab('dashboard')}>📊 Dashboard</button>
        <button className={`nav-tab ${activeTab === 'summarizer' ? 'active' : ''}`} onClick={() => setActiveTab('summarizer')}>📋 Summarizer</button>
        <button className={`nav-tab ${activeTab === 'actions' ? 'active' : ''}`} onClick={() => setActiveTab('actions')}>✓ Actions</button>
        <button className={`nav-tab ${activeTab === 'meeting' ? 'active' : ''}`} onClick={() => setActiveTab('meeting')}>👥 Meeting Notes</button>
        <button className={`nav-tab ${activeTab === 'signals' ? 'active' : ''}`} onClick={() => setActiveTab('signals')}>🚨 RFI/Change Orders</button>
      </nav>

      <div className="app-body">
        {/* Left Panel - Gmail Inbox */}
        {activeTab !== 'dashboard' && (
          <div className="left-panel">
            {!gmailConnected ? (
              <GmailConnect
                userId={userId}
                onConnect={() => setGmailConnected(true)}
              />
            ) : (
              <GmailInbox
                userId={userId}
                onEmailSelect={handleEmailSelect}
              />
            )}
          </div>
        )}

        {/* Right Panel - Main Content */}
        <div className={`right-panel ${activeTab === 'dashboard' ? 'full-width' : ''}`}>
          {activeTab === 'dashboard' && <Dashboard userId={userId} />}
          {activeTab === 'summarizer' && <Summarizer userId={userId} selectedEmailText={selectedEmailText} />}
          {activeTab === 'actions' && <ActionExtractor userId={userId} selectedEmailText={selectedEmailText} />}
          {activeTab === 'meeting' && <MeetingNotes userId={userId} selectedEmailText={selectedEmailText} />}
          {activeTab === 'signals' && <SignalDetector userId={userId} selectedEmailText={selectedEmailText} />}
        </div>
      </div>
    </div>
  );
}