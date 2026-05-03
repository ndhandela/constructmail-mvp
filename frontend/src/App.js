import React, { useState } from 'react';
import Summarizer from './components/Summarizer';
import ActionExtractor from './components/ActionExtractor';
import MeetingNotes from './components/MeetingNotes';
import SignalDetector from './components/SignalDetector';
import './theme.css';
import './styles/components.css';
import './App.css';

function App() {
  const [activeTab, setActiveTab] = useState('summarizer');

  return (
    <div className="App">
      <header className="header">
        <h1>📧 ConstructMail</h1>
        <p>AI-powered email intelligence for General Contractors</p>
      </header>

      <nav className="nav-tabs">
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

      <div className="tab-content">
        {activeTab === 'summarizer' && <Summarizer />}
        {activeTab === 'actions' && <ActionExtractor />}
        {activeTab === 'meeting' && <MeetingNotes />}
        {activeTab === 'signals' && <SignalDetector />}
      </div>
    </div>
  );
}

export default App;