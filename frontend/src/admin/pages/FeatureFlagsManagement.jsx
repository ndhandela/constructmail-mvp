import React, { useState, useEffect, useCallback } from 'react';
import '../styles/FeatureFlagsManagement.css';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

export default function FeatureFlagsManagement({ token, onNavigate }) {
  const [flags, setFlags] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState({
    feature_name: 'mail_intelligence',
    is_enabled: true,
    is_global: true,
    company_id: null
  });

  useEffect(() => {
    fetchFlags();
    fetchClients();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchFlags = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/feature-flags`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      if (data.success) {
        setFlags(data.flags);
      }
    } catch (err) {
      console.error('Fetch flags error:', err);
    } finally {
      setLoading(false);
    }
  }, [token]);

  const fetchClients = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/companies?limit=100`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      if (data.success) {
        setClients(data.companies);
      }
    } catch (err) {
      console.error('Fetch companies error:', err);
    }
  }, [token]);

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/feature-flags`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData)
      });

      const data = await response.json();
      if (data.success) {
        fetchFlags();
        setFormData({
          feature_name: 'mail_intelligence',
          is_enabled: true,
          is_global: true,
          company_id: null
        });
      }
    } catch (err) {
      console.error('Submit flags error:', err);
    }
  };

  if (loading) {
    return <div className="flags-loading">Loading feature flags...</div>;
  }

  return (
    <div className="feature-flags-management">
      <div className="flags-header">
        <div className="flags-header-content">
          <div>
            <h2>Feature Flags</h2>
            <p>Enable/disable features globally or per client</p>
          </div>
          <button 
            className="back-btn"
            onClick={() => onNavigate('dashboard')}
          >
            ← Back to Dashboard
          </button>
        </div>
      </div>

      <div className="flags-container">
        <div className="flags-form">
          <h3>Add/Update Feature Flag</h3>
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Feature Name</label>
              <select name="feature_name" value={formData.feature_name} onChange={handleInputChange}>
                <option value="mail_intelligence">Mail Intelligence</option>
                <option value="clash_detection">Clash Detection</option>
                <option value="vendor_search">Vendor Search</option>
              </select>
            </div>

            <div className="form-group checkbox">
              <label>
                <input
                  type="checkbox"
                  name="is_enabled"
                  checked={formData.is_enabled}
                  onChange={handleInputChange}
                />
                Enabled
              </label>
            </div>

            <div className="form-group checkbox">
              <label>
                <input
                  type="checkbox"
                  name="is_global"
                  checked={formData.is_global}
                  onChange={handleInputChange}
                />
                Global
              </label>
            </div>

            {!formData.is_global && (
              <div className="form-group">
                <label>Client</label>
                <select name="company_id" value={formData.company_id || ''} onChange={handleInputChange}>
                  <option value="">Select a client</option>
                  {clients.map(client => (
                    <option key={client.id} value={client.id}>{client.name}</option>
                  ))}
                </select>
              </div>
            )}

            <button type="submit" className="submit-btn">Save Flag</button>
          </form>
        </div>

        <div className="flags-list">
          <h3>Current Flags</h3>
          <div className="flags-items">
            {flags.map(flag => (
              <div key={flag.id} className="flag-item">
                <div className="flag-details">
                  <strong>{flag.feature_name}</strong>
                  <span className={`flag-status ${flag.is_enabled ? 'enabled' : 'disabled'}`}>
                    {flag.is_enabled ? '✓ Enabled' : '✗ Disabled'}
                  </span>
                  <span className="flag-type">{flag.is_global ? 'Global' : `Client: ${flag.company_id}`}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
