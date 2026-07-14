import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

const PROVIDER_LABEL = { gmail: 'Gmail', outlook: 'Outlook' };

function dismissedKey(userId, provider) {
  return `pomar_mail_reply_banner_dismissed_${userId}_${provider}`;
}

// Reuses the same popup + postMessage OAuth pattern as GmailConnect/OutlookConnect,
// but re-runs it against whatever scopes the backend currently requests (gmail.send /
// Mail.Send once the manual OAuth-console prerequisite is live).
function reconnect(provider, userId, onDone) {
  const urlEndpoint = provider === 'gmail' ? 'gmail-url' : 'outlook-url';
  const callbackEndpoint = provider === 'gmail' ? 'gmail-callback' : 'outlook-callback';
  const messageType = provider === 'gmail' ? 'GMAIL_CALLBACK' : 'OUTLOOK_CALLBACK';

  axios.get(`${API_BASE_URL}/api/auth/${urlEndpoint}`).then((response) => {
    const authUrl = response.data.authUrl;
    const codeVerifier = response.data.codeVerifier; // gmail only; ignored by outlook-callback
    const popup = window.open(authUrl, `${provider} Reconnect`, 'width=500,height=600');
    let received = false;

    const messageHandler = (event) => {
      if (event.data.type === messageType && !received) {
        received = true;
        window.removeEventListener('message', messageHandler);
        const { code, error } = event.data;
        if (error) {
          alert(`${PROVIDER_LABEL[provider]} reconnect failed: ${error}`);
          return;
        }
        if (code) {
          axios.post(`${API_BASE_URL}/api/auth/${callbackEndpoint}`, { code, userId, codeVerifier })
            .then(() => onDone())
            .catch(() => alert(`Failed to reconnect ${PROVIDER_LABEL[provider]}`));
        }
      }
    };
    window.addEventListener('message', messageHandler);

    const checkClosed = setInterval(() => {
      if (popup.closed) {
        clearInterval(checkClosed);
        window.removeEventListener('message', messageHandler);
      }
    }, 500);
  }).catch(() => alert(`Failed to start ${PROVIDER_LABEL[provider]} reconnect`));
}

export default function ReplyAccessBanner({ userId, gmailConnected, outlookConnected }) {
  const [status, setStatus] = useState(null);
  const [dismissed, setDismissed] = useState({});

  const fetchStatus = useCallback(() => {
    if (!userId) return;
    axios.get(`${API_BASE_URL}/api/mail/connection-status`, { params: { userId } })
      .then((res) => setStatus(res.data))
      .catch(() => setStatus(null));
  }, [userId]);

  useEffect(() => { fetchStatus(); }, [fetchStatus, gmailConnected, outlookConnected]);

  if (!status) return null;

  const needsReconnect = ['gmail', 'outlook'].filter((provider) => {
    const s = status[provider];
    return s && s.connected && !s.send_enabled && !dismissed[provider] &&
      localStorage.getItem(dismissedKey(userId, provider)) !== 'true';
  });

  if (needsReconnect.length === 0) return null;

  const handleDismiss = (provider) => {
    localStorage.setItem(dismissedKey(userId, provider), 'true');
    setDismissed((d) => ({ ...d, [provider]: true }));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '12px 20px' }}>
      {needsReconnect.map((provider) => (
        <div
          key={provider}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: '12px', background: '#FEF3C7', border: '1px solid #D97706',
            borderRadius: '10px', padding: '10px 16px', fontSize: '0.88rem', color: '#0E1B2C',
          }}
        >
          <span>
            ✉️ Reply from POMAR Mail — reconnect your {PROVIDER_LABEL[provider]} account to enable
          </span>
          <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
            <button
              onClick={() => reconnect(provider, userId, fetchStatus)}
              style={{
                background: '#D97706', color: '#fff', border: 'none', padding: '6px 14px',
                borderRadius: '8px', fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer',
              }}
            >
              Reconnect
            </button>
            <button
              onClick={() => handleDismiss(provider)}
              style={{
                background: 'transparent', color: '#475569', border: '1px solid #e0d8cf',
                padding: '6px 10px', borderRadius: '8px', fontSize: '0.8rem', cursor: 'pointer',
              }}
            >
              ✕
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
