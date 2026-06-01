import React, { useState } from 'react';
import Dashboard from '../components/Dashboard';
import Summarizer from '../components/Summarizer';
import ActionExtractor from '../components/ActionExtractor';
import MeetingNotes from '../components/MeetingNotes';
import SignalDetector from '../components/SignalDetector';
import GmailConnect from '../components/GmailConnect';
import GmailInbox from '../components/GmailInbox';
import OutlookConnect from '../components/OutlookConnect';
import OutlookInbox from '../components/OutlookInbox';
import '../../../styles/theme.css';
import '../../../styles/components.css';

export default function ConstructMailApp({ user, userId, onLogout }) {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [gmailConnected, setGmailConnected] = useState(false);
  const [outlookConnected, setOutlookConnected] = useState(false);
  const [selectedEmailText, setSelectedEmailText] = useState('');

  const handleEmailSelect = (thread) => {
    setSelectedEmailText(thread);
  };

  return (
    <div className="App">
      <nav className="nav-tabs" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
          <button className={`nav-tab ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveTab('dashboard')}>📊 Dashboard</button>
          <button className={`nav-tab ${activeTab === 'summarizer' ? 'active' : ''}`} onClick={() => setActiveTab('summarizer')}>📋 Summarizer</button>
          <button className={`nav-tab ${activeTab === 'actions' ? 'active' : ''}`} onClick={() => setActiveTab('actions')}>✓ Actions</button>
          <button className={`nav-tab ${activeTab === 'meeting' ? 'active' : ''}`} onClick={() => setActiveTab('meeting')}>👥 Meeting Notes</button>
          <button className={`nav-tab ${activeTab === 'signals' ? 'active' : ''}`} onClick={() => setActiveTab('signals')}>🚨 RFI/Change Orders</button>
        </div>
        <a href="/connect" style={{ textDecoration: 'none', padding: '0 12px' }}>
          <button style={{ background: '#D97706', color: '#fff', border: 'none', padding: '7px 14px', borderRadius: '8px', fontWeight: '600', fontSize: '0.82rem', cursor: 'pointer' }}>
            ⚡ Connect
          </button>
        </a>
      </nav>

      <div className="app-body">
        {activeTab !== 'dashboard' && (
          <div className="left-panel">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {!gmailConnected ? (
                <GmailConnect userId={userId} onConnect={() => setGmailConnected(true)} />
              ) : (
                <GmailInbox userId={userId} onEmailSelect={handleEmailSelect} />
              )}
              {!outlookConnected ? (
                <OutlookConnect userId={userId} onConnect={() => setOutlookConnected(true)} />
              ) : (
                <OutlookInbox userId={userId} onEmailSelect={handleEmailSelect} />
              )}
            </div>
          </div>
        )}

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
