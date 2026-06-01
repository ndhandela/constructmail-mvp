import React, { useState, useEffect } from 'react';
import '../styles/ClientsManagement.css';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

const ALL_MODULES = [
  { key: 'mail',        label: 'POMAR Mail' },
  { key: 'clash',       label: 'POMAR Clash' },
  { key: 'vendors',     label: 'POMAR Vendors' },
  { key: 'marketplace', label: 'Marketplace' },
];

function ModuleToggles({ client, token, onModulesUpdated }) {
  const [modules, setModules] = useState({
    mail: false, clash: false, vendors: false, marketplace: false,
    ...(client.active_modules || {}),
  });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  const handleToggle = (key) => {
    setModules(prev => ({ ...prev, [key]: !prev[key] }));
    setMsg(null);
  };

  const handleSave = async () => {
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/clients/${client.id}/modules`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ modules }),
      });
      const data = await res.json();
      if (data.success) {
        setMsg({ type: 'success', text: 'Saved!' });
        if (onModulesUpdated) onModulesUpdated(client.id, data.active_modules);
        setTimeout(() => setMsg(null), 2500);
      } else {
        setMsg({ type: 'error', text: data.detail || 'Save failed.' });
      }
    } catch {
      setMsg({ type: 'error', text: 'Network error.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="module-toggles">
      <span className="module-toggles-label">Modules:</span>
      <div className="module-toggle-list">
        {ALL_MODULES.map(({ key, label }) => (
          <label key={key} className="module-toggle-item">
            <input
              type="checkbox"
              checked={!!modules[key]}
              onChange={() => handleToggle(key)}
            />
            <span className="module-toggle-name">{label}</span>
          </label>
        ))}
      </div>
      <button
        className="save-modules-btn"
        onClick={handleSave}
        disabled={saving}
      >
        {saving ? 'Saving…' : 'Save'}
      </button>
      {msg && (
        <span className={`modules-msg modules-msg--${msg.type}`}>{msg.text}</span>
      )}
    </div>
  );
}

export default function ClientsManagement({ token, onNavigate }) {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ offset: 0, limit: 20, total: 0 });
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => {
    fetchClients();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagination.offset]);

  const fetchClients = async () => {
    setLoading(true);
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/admin/clients?limit=${pagination.limit}&offset=${pagination.offset}`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      const data = await response.json();
      if (data.success) {
        setClients(data.clients);
        setPagination(prev => ({ ...prev, total: data.total }));
      }
    } catch (err) {
      console.error('Fetch clients error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleModulesUpdated = (clientId, newModules) => {
    setClients(prev =>
      prev.map(c => c.id === clientId ? { ...c, active_modules: newModules } : c)
    );
  };

  const handleNextPage = () => setPagination(prev => ({ ...prev, offset: prev.offset + prev.limit }));
  const handlePrevPage = () => setPagination(prev => ({ ...prev, offset: Math.max(0, prev.offset - prev.limit) }));

  if (loading) return <div className="clients-loading">Loading clients...</div>;

  const hasNextPage = pagination.offset + pagination.limit < pagination.total;
  const hasPrevPage = pagination.offset > 0;

  return (
    <div className="clients-management">
      <div className="clients-header">
        <div className="clients-header-content">
          <div>
            <h2>GC Clients</h2>
            <p>Manage General Contractor accounts and subscriptions</p>
          </div>
          <button className="back-btn" onClick={() => onNavigate('dashboard')}>
            ← Back to Dashboard
          </button>
        </div>
      </div>

      <div className="clients-container">
        <div className="clients-table-wrapper">
          <table className="clients-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Company</th>
                <th>Projects</th>
                <th>Status</th>
                <th>Joined</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {clients.map(client => (
                <React.Fragment key={client.id}>
                  <tr className="client-row">
                    <td className="client-name">{client.name || 'N/A'}</td>
                    <td className="client-email">{client.email}</td>
                    <td className="client-company">{client.company || 'N/A'}</td>
                    <td className="client-projects">{client.project_count}</td>
                    <td className="client-status">
                      <span className="status-badge active">Active</span>
                    </td>
                    <td className="client-joined">
                      {new Date(client.created_at).toLocaleDateString()}
                    </td>
                    <td className="client-action">
                      <button
                        className="expand-btn"
                        onClick={() => setExpandedId(expandedId === client.id ? null : client.id)}
                      >
                        {expandedId === client.id ? '▼' : '▶'}
                      </button>
                    </td>
                  </tr>

                  {expandedId === client.id && (
                    <tr className="client-details-row">
                      <td colSpan="7">
                        <div className="client-details">
                          <div className="detail-item">
                            <span className="detail-label">Client ID:</span>
                            <span className="detail-value">{client.id}</span>
                          </div>
                          <div className="detail-item">
                            <span className="detail-label">Subscription Date:</span>
                            <span className="detail-value">
                              {client.subscription_date
                                ? new Date(client.subscription_date).toLocaleDateString()
                                : 'Not subscribed'}
                            </span>
                          </div>
                          <div className="detail-item detail-item--full">
                            <ModuleToggles
                              client={client}
                              token={token}
                              onModulesUpdated={handleModulesUpdated}
                            />
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>

        <div className="clients-pagination">
          <button onClick={handlePrevPage} disabled={!hasPrevPage || loading} className="pagination-btn">
            ← Previous
          </button>
          <span className="pagination-info">
            Page {Math.floor(pagination.offset / pagination.limit) + 1} of{' '}
            {Math.ceil(pagination.total / pagination.limit)}
          </span>
          <button onClick={handleNextPage} disabled={!hasNextPage || loading} className="pagination-btn">
            Next →
          </button>
        </div>
      </div>
    </div>
  );
}
