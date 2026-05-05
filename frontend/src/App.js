import React, { useState } from 'react';
import Dashboard from './components/Dashboard';
import Summarizer from './components/Summarizer';
import ActionExtractor from './components/ActionExtractor';
import MeetingNotes from './components/MeetingNotes';
import SignalDetector from './components/SignalDetector';
import './theme.css';
import './styles/components.css';
import './App.css';

function App() {
  const [activeTab, setActiveTab] = useState('dashboard');

  return (
    <div className="App">
      <header className="header">
        <div className="header-content">
          <img src="/logos/pomar.png" alt="pomar" className="logo-pomar" />
          <div className="header-center">
            <img src="/logos/constructmail.png" alt="ConstructMail" className="logo-constructmail" />
            <p className="header-subtitle">AI-powered email intelligence for General Contractors</p>
          </div>
        </div>
      </header> 


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