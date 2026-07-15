import React, { useState, useEffect } from 'react';
import axios from 'axios';
import '../styles/ActionExtractor.css';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

export default function ActionExtractor({ userId, selectedEmailText })  {
  const [emailText, setEmailText] = useState('');
  const [loading, setLoading] = useState(false);
  const [actions, setActions] = useState([]);
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
  setActions([]);

  try {
    const userId = localStorage.getItem('constructmail_userId');
    
    const response = await axios.post(`${API_BASE_URL}/api/extract-actions`, {
      emailText,
      userId: userId,
    }, {
      timeout: 30000,
    });
    setActions(response.data);
    setEmailText('');
  } catch (err) {
    const errorMsg = err.response?.data?.error || err.message || 'Unknown error occurred';
    setError(errorMsg);
  } finally {
    setLoading(false);
  }
};

  const exportCSV = () => {
    const headers = ['Action', 'Assigned To', 'Due Date', 'Status'];
    const rows = actions.map(a => [
      a.description,
      a.assigned_to || '-',
      a.due_date || '-',
      a.status
    ]);
    
    let csv = headers.join(',') + '\n';
    rows.forEach(row => {
      csv += row.map(cell => `"${cell}"`).join(',') + '\n';
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `actions-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  return (
    <div className="action-extractor">
      <h2>Action Item Extractor</h2>
      <p className="subtitle">Extract tasks and responsibilities from emails automatically.</p>
      
      <form onSubmit={handleSubmit}>
        <textarea
          placeholder="Paste email or meeting notes..."
          value={emailText}
          onChange={(e) => setEmailText(e.target.value)}
          rows={10}
          required
        />
        <button type="submit" disabled={loading}>
          {loading ? 'Extracting...' : 'Extract Actions'}
        </button>
      </form>

      {error && <div className="error">{error}</div>}

      {actions.length > 0 && (
        <div className="actions-result">
          <div className="actions-header">
            <h3>Extracted Actions ({actions.length})</h3>
            <button className="export-btn" onClick={exportCSV}>
              📥 Export CSV
            </button>
          </div>
          <div className="table-responsive">
            <table>
              <thead>
                <tr>
                  <th>Action</th>
                  <th>Assigned To</th>
                  <th>Due Date</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {actions.map(a => (
                  <tr key={a.id}>
                    <td>{a.description}</td>
                    <td className="person">{a.assigned_to || '-'}</td>
                    <td className="date">{a.due_date || '-'}</td>
                    <td>
                      <span className={`status ${a.status}`}>
                        {a.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!error && actions.length === 0 && emailText && !loading && (
        <div className="no-results">No action items found in the text.</div>
      )}
    </div>
  );
}