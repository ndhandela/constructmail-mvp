import React, { useState, useEffect } from 'react';
import axios from 'axios';
import '../styles/SignalDetector.css';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

export default function SignalDetector({ userId, selectedEmailText }) {
  const [emailText, setEmailText] = useState('');
  const [loading, setLoading] = useState(false);
  const [signals, setSignals] = useState([]);
  const [error, setError] = useState('');

useEffect(() => {
    if (selectedEmailText) {
      setEmailText(selectedEmailText);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEmailText]);

const handleSubmit = async (e) => {
  e.preventDefault();
  setLoading(true);
  setError('');
  setSignals([]);

try {
    const userId = localStorage.getItem('constructmail_userId');
    
    const response = await axios.post(`${API_BASE_URL}/api/detect-signals`, {
      emailText,
      userId: userId,
    }, {
      timeout: 30000,
    });
    setSignals(response.data);
    setEmailText('');
  } catch (err) {
    const errorMsg = err.response?.data?.error || err.message || 'Unknown error occurred';
    setError(errorMsg);
  } finally {
    setLoading(false);
  }
};

  const getSignalColor = (type) => {
    const colors = {
      RFI: '#ff6b6b',
      ChangeOrder: '#ffa500',
      Submittal: '#4ecdc4',
      ScheduleImpact: '#f9ca24',
      Claim: '#ee5a6f',
      Delay: '#ff8c42',
      SafetyIssue: '#d32f2f',
    };
    return colors[type] || '#666';
  };

  return (
    <div className="signal-detector">
      <h2>RFI & Change Order Detection</h2>
      <p className="subtitle">Automatically detect RFIs, change orders, and other critical construction signals.</p>
      
      <form onSubmit={handleSubmit}>
        <textarea
          placeholder="Paste email to scan for construction signals..."
          value={emailText}
          onChange={(e) => setEmailText(e.target.value)}
          rows={10}
          required
        />
        <button type="submit" disabled={loading}>
          {loading ? 'Scanning...' : 'Detect Signals'}
        </button>
      </form>

      {error && <div className="error">{error}</div>}

      {signals.length > 0 && (
        <div className="signals-result">
          <h3>Detected Signals ({signals.length})</h3>
          <div className="signals-list">
            {signals.map(s => (
              <div key={s.id} className="signal-card">
                <div className="signal-header">
                  <span 
                    className="signal-badge" 
                    style={{ backgroundColor: getSignalColor(s.signal_type) }}
                  >
                    {s.signal_type}
                  </span>
                  <span className="confidence">
                    {Math.round((s.confidence || 0) * 100)}% confidence
                  </span>
                </div>
                <p className="signal-text">"{s.raw_text}"</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {!error && signals.length === 0 && emailText && !loading && (
        <div className="no-signals">
          No high-confidence signals detected in this email.
        </div>
      )}
    </div>
  );
}