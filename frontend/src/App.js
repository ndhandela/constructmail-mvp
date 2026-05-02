import React, { useState } from 'react';
import Summarizer from './components/Summarizer';
import './App.css';

function App() {
  return (
    <div className="App">
      <header className="header">
        <h1>✉️ ConstructMail Intelligence</h1>
        <p>AI-powered email intelligence for General Contractors</p>
      </header>
      
      <Summarizer />
    </div>
  );
}

export default App;