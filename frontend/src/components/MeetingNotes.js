import React, { useState, useEffect } from 'react';
import axios from 'axios';
import '../styles/MeetingNotes.css';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

export default function MeetingNotes() {
  const [notesText, setNotesText] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

    useEffect(() => {
    if (selectedEmailText) {
      setNotesText(selectedEmailText);
    }
  }, [selectedEmailText]);
  
const handleSubmit = async (e) => {
  e.preventDefault();
  setLoading(true);
  setError('');
  setResult(null);

  try {
    const userId = localStorage.getItem('constructmail_userId');
    
    const response = await axios.post(`${API_BASE_URL}/api/process-meeting`, {
      notesText,
      userId: userId
    }, {
      timeout: 30000,
    });
    setResult(response.data);
    setNotesText('');
  } catch (err) {
    const errorMsg = err.response?.data?.error || err.message || 'Unknown error occurred';
    setError(errorMsg);
  } finally {
    setLoading(false);
  }
};

  return (
    <div className="meeting-notes-container">
      <h2>Meeting Notes Processor</h2>
      <p className="subtitle">Convert meeting notes into structured decisions and action items.</p>
      
      <form onSubmit={handleSubmit}>
        <textarea
          placeholder="Paste meeting notes (include attendees, decisions, tasks)..."
          value={notesText}
          onChange={(e) => setNotesText(e.target.value)}
          rows={10}
          required
        />
        <button type="submit" disabled={loading}>
          {loading ? 'Processing...' : 'Process Notes'}
        </button>
      </form>

      {error && <div className="error">{error}</div>}

      {result && (
        <div className="meeting-result">
          {result.summary && (
            <div className="result-card">
              <h3>Summary</h3>
              <p>{result.summary}</p>
            </div>
          )}

          {result.attendees && result.attendees.length > 0 && (
            <div className="result-card">
              <h3>Attendees</h3>
              <ul>
                {result.attendees.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            </div>
          )}

          {result.decisions && result.decisions.length > 0 && (
            <div className="result-card">
              <h3>Decisions</h3>
              <ul>
                {result.decisions.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            </div>
          )}

          {result.action_items && result.action_items.length > 0 && (
            <div className="result-card">
              <h3>Action Items</h3>
              <table>
                <thead>
                  <tr>
                    <th>Action</th>
                    <th>Owner</th>
                    <th>Due Date</th>
                  </tr>
                </thead>
                <tbody>
                  {result.action_items.map(a => (
                    <tr key={a.id}>
                      <td>{a.description}</td>
                      <td>{a.assigned_to || '-'}</td>
                      <td>{a.due_date || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {result.open_issues && result.open_issues.length > 0 && (
            <div className="result-card">
              <h3>Open Issues</h3>
              <ul>
                {result.open_issues.map((o, i) => (
                  <li key={i}>{o}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}