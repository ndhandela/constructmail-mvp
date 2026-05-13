import React, { useState } from 'react';
import axios from 'axios';
import '../styles/OutlookConnect.css';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

export default function OutlookConnect({ userId, onConnect }) {
  const [loading, setLoading] = useState(false);
  const [isConnected, setIsConnected] = useState(false);

const handleConnectOutlook = async () => {
  setLoading(true);
  try {
    const response = await axios.get(`${API_BASE_URL}/api/auth/outlook-url`);
    const authUrl = response.data.authUrl;

    const popup = window.open(authUrl, 'Outlook Login', 'width=500,height=600');

    let callbackReceived = false;

    // Poll for the message instead of using event listener
    const messageHandler = (event) => {
    if (event.data.type === 'OUTLOOK_CALLBACK' && !callbackReceived) {
        callbackReceived = true;
        window.removeEventListener('message', messageHandler);
        const { code, error } = event.data;

        if (error) {
          alert('Outlook connection failed: ' + error);
          setLoading(false);
          return;
        }

        if (code) {
          axios.post(`${API_BASE_URL}/api/auth/outlook-callback`, {
            code,
            userId
          }).then(() => {
            setIsConnected(true);
            onConnect();
            setLoading(false);
          }).catch((err) => {
            console.error('Callback error:', err);
            alert('Failed to connect Outlook');
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
    console.error('Error connecting Outlook:', err);
    alert('Failed to connect Outlook');
    setLoading(false);
  }
};

  return (
    <div className="outlook-connect">
      <div className="outlook-card">
        <div className="outlook-icon">📧</div>
        <h2>Connect Your Outlook</h2>
        <p>Auto-load emails from your inbox into ConstructMail</p>

        {isConnected ? (
          <div className="connected">
            <div className="success-badge">✓ Outlook Connected</div>
            <p className="connected-text">Your Outlook is synced</p>
          </div>
        ) : (
          <button
            onClick={handleConnectOutlook}
            disabled={loading}
            className="outlook-button"
          >
            {loading ? 'Connecting...' : '🔗 Connect Outlook Account'}
          </button>
        )}

        <p className="info-text">
          We only read your inbox. We don't send or store emails.
        </p>
      </div>
    </div>
  );
}