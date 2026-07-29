import React, { useState, useEffect } from 'react';
import axios from 'axios';
import '../styles/GmailInbox.css';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

export default function GmailInbox({ userId, onEmailSelect }) {
  const [emails, setEmails] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedEmail, setSelectedEmail] = useState(null);

useEffect(() => {
    fetchEmails();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const fetchEmails = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await axios.get(`${API_BASE_URL}/api/gmail/emails`, {
        params: { userId }
      });
      setEmails(response.data);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to fetch emails');
    } finally {
      setLoading(false);
    }
  };

  const fetchThread = async (threadId) => {
    try {
      const response = await axios.get(
        `${API_BASE_URL}/api/gmail/thread/${threadId}`,
        { params: { userId } }
      );
      const fullThread = response.data.map(msg => msg.body).join('\n\n---\n\n');
      const lastMessage = response.data[response.data.length - 1];
      onEmailSelect({
        body: fullThread,
        provider: 'gmail',
        threadId,
        sourceEmailId: lastMessage?.id,
      });
      setSelectedEmail(threadId);
    } catch (err) {
      alert('Failed to fetch email thread');
    }
  };

  if (loading) {
    return <div className="gmail-loading">Loading your emails...</div>;
  }

  return (
    <div className="gmail-inbox">
      <div className="inbox-header">
        <h3>📧 Your Inbox</h3>
        <button onClick={fetchEmails} className="refresh-btn">
          ↻ Refresh
        </button>
      </div>

      {error && <div className="error-message">{error}</div>}

      {emails.length === 0 ? (
        <div className="empty-inbox">
          <p>No emails found</p>
        </div>
      ) : (
        <div className="email-list">
          {emails.map(email => (
            <div
              key={email.id}
              className={`email-item ${selectedEmail === email.threadId ? 'selected' : ''}`}
              onClick={() => fetchThread(email.threadId)}
            >
              <div className="email-from">{email.from}</div>
              <div className="email-subject">{email.subject}</div>
              <div className="email-preview">{email.body.substring(0, 100)}...</div>
              <div className="email-date">{new Date(email.date).toLocaleDateString()}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}