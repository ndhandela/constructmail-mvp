import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import Dashboard from '../components/Dashboard';
import Summarizer from '../components/Summarizer';
import ActionExtractor from '../components/ActionExtractor';
import MeetingNotes from '../components/MeetingNotes';
import SignalDetector from '../components/SignalDetector';
import GmailConnect from '../components/GmailConnect';
import GmailInbox from '../components/GmailInbox';
import OutlookConnect from '../components/OutlookConnect';
import OutlookInbox from '../components/OutlookInbox';
import ReplyAccessBanner from '../components/ReplyAccessBanner';
import ModuleLockedNotice, { isModuleLocked } from '../../../components/ModuleLockedNotice';
import '../../../styles/theme.css';
import '../../../styles/components.css';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

export default function ConstructMailApp({ user, userId, onLogout }) {
  const [activeTab, setActiveTab] = useState('dashboard');
  const mailLocked = isModuleLocked(user?.active_modules, 'mail');
  const [gmailConnected, setGmailConnected] = useState(false);
  const [outlookConnected, setOutlookConnected] = useState(false);
  const [selectedEmailText, setSelectedEmailText] = useState('');
  const [selectedEmailMeta, setSelectedEmailMeta] = useState(null);
  const [pendingDraftsCount, setPendingDraftsCount] = useState(0);

  const fetchPendingDraftsCount = useCallback(() => {
    if (!userId) return;
    axios.get(`${API_BASE_URL}/api/mail/drafts`, { params: { userId } })
      .then((res) => setPendingDraftsCount(Array.isArray(res.data) ? res.data.length : 0))
      .catch(() => {});
  }, [userId]);

  useEffect(() => { fetchPendingDraftsCount(); }, [fetchPendingDraftsCount]);

  const handleEmailSelect = (selection) => {
    // GmailInbox/OutlookInbox pass { body, provider, threadId, sourceEmailId }
    setSelectedEmailText(selection.body);
    setSelectedEmailMeta({
      provider: selection.provider,
      threadId: selection.threadId,
      sourceEmailId: selection.sourceEmailId,
    });
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
        <a href="/connect" style={{ textDecoration: 'none', padding: '0 12px', position: 'relative' }}>
          <button style={{ background: '#D97706', color: '#fff', border: 'none', padding: '7px 14px', borderRadius: '8px', fontWeight: '600', fontSize: '0.82rem', cursor: 'pointer', position: 'relative' }}>
            ⚡ Connect
            {pendingDraftsCount > 0 && (
              <span style={{
                position: 'absolute', top: '-6px', right: '-6px', background: '#DC2626', color: '#fff',
                borderRadius: '100px', fontSize: '0.68rem', fontWeight: 700, padding: '1px 6px', lineHeight: '1.3',
              }}>
                {pendingDraftsCount}
              </span>
            )}
          </button>
        </a>
      </nav>

      {mailLocked ? (
        <ModuleLockedNotice moduleName="Mail" companyName={user?.company} />
      ) : (
        <>
          <ReplyAccessBanner userId={userId} gmailConnected={gmailConnected} outlookConnected={outlookConnected} />

          {pendingDraftsCount > 0 && (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px',
              background: '#FEF3C7', border: '1px solid #D97706', borderRadius: '10px',
              margin: '0 20px 12px', padding: '10px 16px', fontSize: '0.88rem', color: '#0E1B2C',
            }}>
              <span>
                ✉️ {pendingDraftsCount} reply {pendingDraftsCount === 1 ? 'draft is' : 'drafts are'} awaiting your review
              </span>
              <a href="/connect" style={{ textDecoration: 'none' }}>
                <button style={{
                  background: '#D97706', color: '#fff', border: 'none', padding: '6px 14px',
                  borderRadius: '8px', fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer',
                }}>
                  Go to Action Queue →
                </button>
              </a>
            </div>
          )}

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
              {activeTab === 'summarizer' && <Summarizer userId={userId} selectedEmailText={selectedEmailText} emailMeta={selectedEmailMeta} onDraftCreated={fetchPendingDraftsCount} />}
              {activeTab === 'actions' && <ActionExtractor userId={userId} selectedEmailText={selectedEmailText} />}
              {activeTab === 'meeting' && <MeetingNotes userId={userId} selectedEmailText={selectedEmailText} />}
              {activeTab === 'signals' && <SignalDetector userId={userId} selectedEmailText={selectedEmailText} />}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
