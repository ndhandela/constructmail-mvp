import React, { useState } from 'react';
import axios from 'axios';
import '../styles/GmailConnect.css';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

export default function GmailConnect({ userId, onConnect }) {
  const [loading, setLoading] = useState(false);
  const [isConnected, setIsConnected] = useState(false);

const handleConnectGmail = async () => {
  setLoading(true);
  try {
    const response = await axios.get(`${API_BASE_URL}/api/auth/gmail-url`);
    const authUrl = response.data.authUrl;
    const codeVerifier = response.data.codeVerifier;

    const popup = window.open(authUrl, 'Gmail Login', 'width=500,height=600');

    let callbackReceived = false;

    // Poll for the message instead of using event listener
    const messageHandler = (event) => {
    if (event.data.type === 'GMAIL_CALLBACK' && !callbackReceived) {
        callbackReceived = true;
        window.removeEventListener('message', messageHandler);
        const { code, error } = event.data;

        if (error) {
          alert('Gmail connection failed: ' + error);
          setLoading(false);
          return;
        }

        if (code) {
          axios.post(`${API_BASE_URL}/api/auth/gmail-callback`, {
            code,
            userId,
            codeVerifier
          }).then(() => {
            setIsConnected(true);
            onConnect();
            setLoading(false);
          }).catch((err) => {
            console.error('Callback error:', err);
            alert('Failed to connect Gmail');
            setLoading(false);
          });
        }
      }
    };

    window.addEventListener('message', messageHandler);

    // Fallback: if popup closes without sending message
    const checkClosed = setInterval(() => {
      if (popup.closed) {
        clearInterval(checkClosed);
        window.removeEventListener('message', messageHandler);
        setLoading(false);
      }
    }, 500);

  } catch (err) {
    console.error('Error connecting Gmail:', err);
    alert('Failed to connect Gmail');
    setLoading(false);
  }
};

  return (
    <div className="gmail-connect">
      <div className="gmail-card">
        <div className="gmail-icon">
            <svg width="48" height="48" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
                <circle cx="50" cy="50" r="32" fill="none" stroke="#0E1B2C" strokeWidth="7"/>
                <circle cx="50" cy="50" r="18" fill="none" stroke="#D97706" strokeWidth="3"/>
                <circle cx="50" cy="50" r="5" fill="#D97706"/>
            </svg>
        </div>
        <h2>Connect Your Gmail</h2>
        <p>Auto-load emails from your inbox into ConstructMail</p>

        {isConnected ? (
          <div className="connected">
            <div className="success-badge">✓ Gmail Connected</div>
            <p className="connected-text">Your Gmail is synced</p>
          </div>
        ) : (
          <button
            onClick={handleConnectGmail}
            disabled={loading}
            className="gmail-button"
          >
            {loading ? 'Connecting...' : '🔗 Connect Gmail Account'}
          </button>
        )}

        <p className="info-text">
          We only read your inbox. We don't send or store emails.
        </p>
      </div>
    </div>
  );
}