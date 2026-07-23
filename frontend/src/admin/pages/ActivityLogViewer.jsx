import React, { useState, useEffect } from 'react';
import '../styles/ActivityLogViewer.css';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

export default function ActivityLogViewer({ token, onNavigate }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({
    offset: 0,
    limit: 50,
    total: 0
  });
  const [moduleKey, setModuleKey] = useState('');

  useEffect(() => {
    fetchLogs();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagination.offset, moduleKey]);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const moduleParam = moduleKey ? `&module_key=${moduleKey}` : '';
      const response = await fetch(
        `${API_BASE_URL}/api/admin/activity-log?limit=${pagination.limit}&offset=${pagination.offset}${moduleParam}`,
        {
          headers: { 'Authorization': `Bearer ${token}` }
        }
      );

      const data = await response.json();
      if (data.success) {
        setLogs(data.logs);
        setPagination(prev => ({ ...prev, total: data.total }));
      }
    } catch (err) {
      console.error('Fetch logs error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleNextPage = () => {
    setPagination(prev => ({
      ...prev,
      offset: prev.offset + prev.limit
    }));
  };

  const handlePrevPage = () => {
    setPagination(prev => ({
      ...prev,
      offset: Math.max(0, prev.offset - prev.limit)
    }));
  };

  const getActionColor = (action) => {
    const colors = {
      'admin_login': '#10B981',
      'admin_logout': '#6B7280',
      'pricing_updated': '#F59E0B',
      'feature_flags_updated': '#3B82F6',
      'admin_user_created': '#8B5CF6',
      'admin_user_updated': '#EC4899',
      'admin_user_deleted': '#EF4444',
      'upload_parsed': '#0EA5E9',
      'qpr_draft_generated': '#0EA5E9',
      'qpr_filed': '#10B981',
      'notice_drafted': '#F59E0B',
      'notice_sent': '#10B981',
      'alert_dismissed': '#6B7280',
      'trust_role_updated': '#8B5CF6',
    };
    return colors[action] || '#6B7280';
  };

  if (loading) {
    return <div className="logs-loading">Loading activity log...</div>;
  }

  const hasNextPage = pagination.offset + pagination.limit < pagination.total;
  const hasPrevPage = pagination.offset > 0;

  return (
    <div className="activity-log-viewer">
      <div className="logs-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2>Activity Log</h2>
            <p>Audit trail of all admin and module actions</p>
          </div>
          <select
            value={moduleKey}
            onChange={(e) => { setModuleKey(e.target.value); setPagination(prev => ({ ...prev, offset: 0 })); }}
            style={{ marginRight: 12, padding: '8px 12px', borderRadius: 8 }}
          >
            <option value="">All modules</option>
            <option value="trust">POMAR Trust</option>
            <option value="marketplace">Marketplace</option>
          </select>
          <button
            onClick={() => onNavigate('dashboard')}
            style={{
              padding: '10px 20px',
              backgroundColor: '#0E1B2C',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer'
            }}
          >
            ← Back to Dashboard
          </button>
        </div>
      </div>

      <div className="logs-container">
        <div className="logs-table-wrapper">
          <table className="logs-table">
            <thead>
              <tr>
                <th>Actor</th>
                <th>Action</th>
                <th>Resource</th>
                <th>Changes</th>
                <th>Timestamp</th>
              </tr>
            </thead>
            <tbody>
              {logs.map(log => (
                <tr key={log.id} className="log-row">
                  <td className="log-admin">
                    {log.admin_email || log.user_email || '—'}
                    {log.module_key && <span className="resource-type" style={{ marginLeft: 6 }}>({log.module_key})</span>}
                  </td>
                  <td className="log-action">
                    <span 
                      className="action-badge"
                      style={{ backgroundColor: getActionColor(log.action) }}
                    >
                      {log.action.replace(/_/g, ' ').toUpperCase()}
                    </span>
                  </td>
                  <td className="log-resource">
                    <span className="resource-type">{log.resource_type}</span>
                    {log.resource_id && <span className="resource-id">#{log.resource_id}</span>}
                  </td>
                  <td className="log-changes">
                    {log.changes ? (
                      <code>{JSON.stringify(log.changes).substring(0, 50)}...</code>
                    ) : (
                      <span className="no-changes">—</span>
                    )}
                  </td>
                  <td className="log-timestamp">
                    {new Date(log.created_at).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="logs-pagination">
          <button 
            onClick={handlePrevPage} 
            disabled={!hasPrevPage || loading}
            className="pagination-btn"
          >
            ← Previous
          </button>
          <span className="pagination-info">
            Page {Math.floor(pagination.offset / pagination.limit) + 1}
          </span>
          <button 
            onClick={handleNextPage} 
            disabled={!hasNextPage || loading}
            className="pagination-btn"
          >
            Next →
          </button>
        </div>
      </div>
    </div>
  );
}
