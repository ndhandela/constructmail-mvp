import React, { useState } from 'react';
import Summarizer from './components/Summarizer';
import ActionExtractor from './components/ActionExtractor';
import './App.css';

function App() {
  const [activeTab, setActiveTab] = useState('summarizer');

  return (
    <div className="App">
      <header className="header">
        <h1>✉️ ConstructMail Intelligence</h1>
        <p>AI-powered email intelligence for General Contractors</p>
      </header>
      
      <div className="tabs">
        <button 
          className={`tab ${activeTab === 'summarizer' ? 'active' : ''}`}
          onClick={() => setActiveTab('summarizer')}
        >
          📄 Summarizer
        </button>
        <button 
          className={`tab ${activeTab === 'actions' ? 'active' : ''}`}
          onClick={() => setActiveTab('actions')}
        >
          ✓ Actions
        </button>
      </div>

      {activeTab === 'summarizer' && <Summarizer />}
      {activeTab === 'actions' && <ActionExtractor />}
    </div>
  );
}

export default App;