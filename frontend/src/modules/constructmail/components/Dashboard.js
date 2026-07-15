import React, { useState, useEffect } from 'react';
import '../styles/Dashboard.css';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

export default function Dashboard() {
  const [summaries, setSummaries] = useState([]);
  const [actions, setActions] = useState([]);
  const [signals, setSignals] = useState([]);
  const [loading, setLoading] = useState(true);

const fetchData = async () => {
  try {
    const userId = localStorage.getItem('constructmail_userId');

    if (!userId) {
      console.error('No userId found in localStorage');
      setLoading(false);
      return;
    }

    const [summariesRes, actionsRes, signalsRes] = await Promise.all([
      fetch(`${API_BASE_URL}/api/recent-summaries?userId=${userId}`),
      fetch(`${API_BASE_URL}/api/open-actions?userId=${userId}`),
      fetch(`${API_BASE_URL}/api/recent-signals?userId=${userId}`)
    ]);

    const summaries = await summariesRes.json();
    const actions = await actionsRes.json();
    const signals = await signalsRes.json();

    setSummaries(summaries);
    setActions(actions);
    setSignals(signals);
    setLoading(false);
  } catch (err) {
    console.error('Error fetching data:', err);
    setLoading(false);
  }
};

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  if (loading) {
    return <div className="dashboard"><p className="loading">Loading dashboard...</p></div>;
  }

  return (
    <div className="dashboard">
      <div className="dashboard-stats">
        <div className="stat-card">
          <div className="stat-number">{summaries.length}</div>
          <div className="stat-label">Summaries</div>
        </div>
        <div className="stat-card">
          <div className="stat-number">{actions.length}</div>
          <div className="stat-label">Open Actions</div>
        </div>
        <div className="stat-card">
          <div className="stat-number">{signals.length}</div>
          <div className="stat-label">Signals</div>
        </div>
      </div>

      <div className="dashboard-grid">
        <div className="dashboard-card">
          <h3>📄 Recent Summaries</h3>
          {summaries.length > 0 ? (
            <ul className="list">
              {summaries.map(s => (
                <li key={s.id}>
                  <p className="preview">{s.summary?.substring(0, 80)}...</p>
                  <span className="date">{new Date(s.created_at).toLocaleDateString()}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty">No summaries yet</p>
          )}
        </div>

        <div className="dashboard-card">
          <h3>✓ Open Action Items</h3>
          {actions.length > 0 ? (
            <ul className="list">
              {actions.slice(0, 5).map(a => (
                <li key={a.id}>
                  <p className="action">{a.description}</p>
                  {a.assigned_to && <span className="assignee">→ {a.assigned_to}</span>}
                  {a.due_date && <span className="date">Due: {a.due_date}</span>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty">No open actions</p>
          )}
        </div>

        <div className="dashboard-card">
          <h3>🚨 Detected Signals</h3>
          {signals.length > 0 ? (
            <ul className="list">
              {signals.slice(0, 5).map(s => (
                <li key={s.id}>
                  <span className="signal-type">{s.signal_type}</span>
                  <p className="preview">"{s.raw_text?.substring(0, 60)}..."</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty">No signals detected</p>
          )}
        </div>
      </div>

      <button className="refresh-btn" onClick={fetchData}>
        🔄 Refresh
      </button>
    </div>
  );
}