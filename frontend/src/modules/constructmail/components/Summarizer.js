import React, { useState, useEffect, useContext } from 'react';
import axios from 'axios';
import { ProjectContext, ALL_PROJECTS } from '../../../contexts/ProjectContext';
import '../styles/Summarizer.css';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

export default function Summarizer({ userId, selectedEmailText, emailMeta, onDraftCreated }) {
  const { currentProjectId } = useContext(ProjectContext);
  const [emailText, setEmailText] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  // Tracks whether emailText still matches the selected inbox thread verbatim —
  // if the user edits it, we stop attaching provider/thread ids to the analysis
  // request so we don't file a draft reply against text that's no longer the thread.
  const [metaValid, setMetaValid] = useState(false);

  useEffect(() => {
    if (selectedEmailText) {
      setEmailText(selectedEmailText);
      setMetaValid(true);
    }
  }, [selectedEmailText]);

  const handleTextChange = (e) => {
    setEmailText(e.target.value);
    if (e.target.value !== selectedEmailText) {
      setMetaValid(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setResult(null);

    try {
      const meta = metaValid && emailMeta ? emailMeta : {};
      const response = await axios.post(`${API_BASE_URL}/api/summarize`, {
        emailText,
        userId: userId,
        projectId: currentProjectId !== ALL_PROJECTS ? currentProjectId : undefined,
        provider: meta.provider,
        threadId: meta.threadId,
        sourceEmailId: meta.sourceEmailId,
      }, {
        timeout: 30000,
      });
      setResult(response.data);
      if (response.data.draft_reply_id && onDraftCreated) {
        onDraftCreated();
      }
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
      <p className="subtitle">Select an email from your inbox above, or paste an email thread below.</p>

      <form onSubmit={handleSubmit}>
        <textarea
          placeholder="Paste email thread here..."
          value={emailText}
          onChange={handleTextChange}
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
          {result.draft_reply_id && (
            <div className="result-card" style={{ background: '#FEF3C7', borderColor: '#D97706' }}>
              <p style={{ margin: 0 }}>
                ✉️ A draft reply was generated and added to the <strong>Action Queue</strong> for your review.
              </p>
            </div>
          )}
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