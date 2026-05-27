import React, { useState, useEffect } from 'react';
import '../styles/ClientsManagement.css';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

export default function ClientsManagement({ token, onNavigate }) {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({
    offset: 0,
    limit: 20,
    total: 0
  });
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
        {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
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

  if (loading) {
    return <div className="clients-loading">Loading clients...</div>;
  }

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
          <button 
            className="back-btn"
            onClick={() => onNavigate('dashboard')}
          >
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
                            <span className="detail-label">Active Modules:</span>
                            <span className="detail-value">
                              {client.active_modules ? (
                                Object.entries(client.active_modules)
                                  .filter(([_, active]) => active)
                                  .map(([module, _]) => module)
                                  .join(', ') || 'None'
                              ) : 'None'}
                            </span>
                          </div>
                          <div className="detail-item">
                            <span className="detail-label">Subscription Date:</span>
                            <span className="detail-value">
                              {client.subscription_date 
                                ? new Date(client.subscription_date).toLocaleDateString()
                                : 'Not subscribed'
                              }
                            </span>
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
          <button 
            onClick={handlePrevPage} 
            disabled={!hasPrevPage || loading}
            className="pagination-btn"
          >
            ← Previous
          </button>
          <span className="pagination-info">
            Page {Math.floor(pagination.offset / pagination.limit) + 1} of {Math.ceil(pagination.total / pagination.limit)}
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
