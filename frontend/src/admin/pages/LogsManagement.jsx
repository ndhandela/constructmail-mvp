import React, { useState, useEffect, useCallback } from 'react';
import '../styles/LogsManagement.css';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

const TABS = [
  { key: 'server', label: 'Server' },
  { key: 'frontend', label: 'Frontend' },
  { key: 'email', label: 'Email Delivery' },
  { key: 'activity', label: 'Activity Log' },
];

const SEVERITY_COLORS = {
  error: '#EF4444',
  warning: '#F59E0B',
  info: '#10B981',
};

const ACTION_COLORS = {
  admin_login: '#10B981',
  admin_logout: '#6B7280',
  company_created: '#3B82F6',
  pricing_updated: '#F59E0B',
  feature_flags_updated: '#3B82F6',
  modules_updated: '#3B82F6',
  admin_user_created: '#8B5CF6',
  admin_user_updated: '#EC4899',
  admin_user_deleted: '#EF4444',
};

export default function LogsManagement({ token, admin, onNavigate }) {
  const isSuperAdmin = admin?.admin_level === 'super_admin';

  const [activeTab, setActiveTab] = useState('server');
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [counts, setCounts] = useState({ server: 0, frontend: 0, email: 0, activity: 0 });
  const [companies, setCompanies] = useState([]);
  const [pagination, setPagination] = useState({ offset: 0, limit: 50, total: 0 });
  const [filters, setFilters] = useState({ search: '', severity: '', companyId: '', dateFrom: '', dateTo: '' });

  const fetchCounts = useCallback(async () => {
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const [serverRes, frontendRes, emailRes, activityRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/admin/logs?source=server&limit=1`, { headers }),
        fetch(`${API_BASE_URL}/api/admin/logs?source=frontend&limit=1`, { headers }),
        fetch(`${API_BASE_URL}/api/admin/logs?source=email&limit=1`, { headers }),
        fetch(`${API_BASE_URL}/api/admin/activity-log?limit=1`, { headers }),
      ]);
      const [server, frontendData, email, activity] = await Promise.all([
        serverRes.json(), frontendRes.json(), emailRes.json(), activityRes.json(),
      ]);
      setCounts({
        server: server.total || 0,
        frontend: frontendData.total || 0,
        email: email.total || 0,
        activity: activity.total || 0,
      });
    } catch (err) {
      console.error('Fetch log counts error:', err);
    }
  }, [token]);

  const fetchCompanies = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/companies?limit=100`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) setCompanies(data.companies);
    } catch (err) {
      console.error('Fetch companies error:', err);
    }
  }, [token]);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('limit', pagination.limit);
      params.set('offset', pagination.offset);

      let url;
      if (activeTab === 'activity') {
        url = `${API_BASE_URL}/api/admin/activity-log?${params.toString()}`;
      } else {
        params.set('source', activeTab);
        if (filters.search) params.set('search', filters.search);
        if (filters.severity) params.set('level', filters.severity);
        if (filters.companyId) params.set('companyId', filters.companyId);
        if (filters.dateFrom) params.set('startDate', filters.dateFrom);
        if (filters.dateTo) params.set('endDate', filters.dateTo);
        url = `${API_BASE_URL}/api/admin/logs?${params.toString()}`;
      }

      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (data.success) {
        setLogs(data.logs);
        setPagination(prev => ({ ...prev, total: data.total }));
      }
    } catch (err) {
      console.error('Fetch logs error:', err);
    } finally {
      setLoading(false);
    }
  }, [activeTab, token, filters, pagination.limit, pagination.offset]);

  useEffect(() => {
    fetchCounts();
    if (isSuperAdmin) fetchCompanies();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetchLogs();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, filters, pagination.offset]);

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setLogs([]);
    setPagination(prev => ({ ...prev, offset: 0, total: 0 }));
  };

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters(prev => ({ ...prev, [name]: value }));
    setPagination(prev => ({ ...prev, offset: 0 }));
  };

  const handleNextPage = () => setPagination(prev => ({ ...prev, offset: prev.offset + prev.limit }));
  const handlePrevPage = () => setPagination(prev => ({ ...prev, offset: Math.max(0, prev.offset - prev.limit) }));

  const hasNextPage = pagination.offset + pagination.limit < pagination.total;
  const hasPrevPage = pagination.offset > 0;

  return (
    <div className="logs-management">
      <div className="logs-mgmt-header">
        <div className="logs-mgmt-header-content">
          <div>
            <h2>Logs</h2>
            <p>Server errors, frontend errors, email delivery, and admin activity</p>
          </div>
          <button className="back-btn" onClick={() => onNavigate('dashboard')}>
            ← Back to Dashboard
          </button>
        </div>
      </div>

      <div className="logs-mgmt-container">
        <div className="logs-tabs">
          {TABS.map(tab => (
            <button
              key={tab.key}
              className={`logs-tab ${activeTab === tab.key ? 'active' : ''}`}
              onClick={() => handleTabChange(tab.key)}
            >
              {tab.label}
              <span className="logs-tab-count">{counts[tab.key]}</span>
            </button>
          ))}
        </div>

        {activeTab !== 'activity' && (
          <div className="logs-filter-bar">
            <input
              type="text"
              name="search"
              placeholder="Search message or detail..."
              value={filters.search}
              onChange={handleFilterChange}
              className="logs-filter-search"
            />
            <select name="severity" value={filters.severity} onChange={handleFilterChange}>
              <option value="">All Severities</option>
              <option value="error">Error</option>
              <option value="warning">Warning</option>
              <option value="info">Info</option>
            </select>
            {isSuperAdmin && (
              <select name="companyId" value={filters.companyId} onChange={handleFilterChange}>
                <option value="">All Companies</option>
                {companies.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            )}
            <input type="date" name="dateFrom" value={filters.dateFrom} onChange={handleFilterChange} />
            <span className="logs-filter-date-sep">to</span>
            <input type="date" name="dateTo" value={filters.dateTo} onChange={handleFilterChange} />
          </div>
        )}

        {loading ? (
          <div className="logs-loading">Loading logs...</div>
        ) : (
          <div className="logs-table-wrapper">
            {activeTab === 'activity' ? (
              <table className="logs-table">
                <thead>
                  <tr>
                    <th>Admin</th>
                    <th>Action</th>
                    <th>Resource</th>
                    <th>Changes</th>
                    <th>Timestamp</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map(log => (
                    <tr key={log.id} className="log-row">
                      <td className="log-admin">{log.admin_email}</td>
                      <td className="log-action">
                        <span className="action-badge" style={{ backgroundColor: ACTION_COLORS[log.action] || '#6B7280' }}>
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
                      <td className="log-timestamp">{new Date(log.created_at).toLocaleString()}</td>
                    </tr>
                  ))}
                  {logs.length === 0 && (
                    <tr><td colSpan="5" className="logs-empty">No activity yet.</td></tr>
                  )}
                </tbody>
              </table>
            ) : (
              <table className="logs-table">
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>Severity</th>
                    <th>Message</th>
                    <th>Company / User</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map(log => (
                    <tr key={log.id} className="log-row">
                      <td className="log-timestamp">{new Date(log.created_at).toLocaleString()}</td>
                      <td className="log-severity">
                        <span
                          className="severity-badge"
                          style={{ backgroundColor: SEVERITY_COLORS[log.level] || '#6B7280' }}
                        >
                          {log.level}
                        </span>
                      </td>
                      <td className="log-message">
                        <div className="log-message-text">{log.message}</div>
                        {log.detail && <div className="log-detail-text">{log.detail}</div>}
                      </td>
                      <td className="log-source-context">
                        {log.company_name && <div>{log.company_name}</div>}
                        {log.user_email && <div className="log-user-email">{log.user_email}</div>}
                        {!log.company_name && !log.user_email && <span className="no-changes">—</span>}
                      </td>
                    </tr>
                  ))}
                  {logs.length === 0 && (
                    <tr><td colSpan="4" className="logs-empty">No logs found.</td></tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        )}

        <div className="logs-pagination">
          <button onClick={handlePrevPage} disabled={!hasPrevPage || loading} className="pagination-btn">
            ← Previous
          </button>
          <span className="pagination-info">
            Page {Math.floor(pagination.offset / pagination.limit) + 1} of{' '}
            {Math.max(1, Math.ceil(pagination.total / pagination.limit))}
          </span>
          <button onClick={handleNextPage} disabled={!hasNextPage || loading} className="pagination-btn">
            Next →
          </button>
        </div>
      </div>
    </div>
  );
}
