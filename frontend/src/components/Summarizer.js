import React, { useState } from 'react';
import axios from 'axios';
import '../styles/Summarizer.css';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

export default function Summarizer() {
  const [emailText, setEmailText] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setResult(null);

    try {
      const response = await axios.post(`${API_BASE_URL}/api/summarize`, {
        emailText,
        projectId: 1,
      }, {
        timeout: 30000, // 30 second timeout
      });
      setResult(response.data);
      setEmailText(''); // Clear form on success
    } catch (err) {
      const errorMsg = err.response?.data?.error || err.message || 'Unknown error occurred';
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    alert('Copied to clipboard!');
  };

  return (
    <div className="summarizer-container">
      <h2>Email Thread Summarizer</h2>
      <p className="subtitle">Paste an email thread. Get a summary, decisions, and action items instantly.</p>
      
      <form onSubmit={handleSubmit}>
        <textarea
          placeholder="Paste email thread here..."
          value={emailText}
          onChange={(e) => setEmailText(e.target.value)}
          rows={10}
          required
        />
        <button type="submit" disabled={loading}>
          {loading ? 'Analyzing...' : 'Summarize Email'}
        </button>
      </form>

      {error && <div className="error">{error}</div>}

      {result && (
        <div className="result">
          <div className="result-card">
            <h3>Summary</h3>
            <p>{result.summary}</p>
            <button className="copy-btn" onClick={() => copyToClipboard(result.summary)}>
              Copy
            </button>
          </div>

          {result.decisions && result.decisions.length > 0 && (
            <div className="result-card">
              <h3>Decisions Made</h3>
              <ul>
                {result.decisions.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            </div>
          )}

          {result.open_items && result.open_items.length > 0 && (
            <div className="result-card">
              <h3>Open Items</h3>
              <ul>
                {result.open_items.map((o, i) => (
                  <li key={i}>{o}</li>
                ))}
              </ul>
            </div>
          )}

          {result.key_people && result.key_people.length > 0 && (
            <div className="result-card">
              <h3>Key People</h3>
              <ul>
                {result.key_people.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}