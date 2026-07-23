import React, { useState, useEffect, useCallback } from 'react';
import '../styles/PricingManagement.css';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

export default function PricingManagement({ token, onNavigate }) {
  const [pricing, setPricing] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({
    module_name: 'mail',
    monthly_price: 0,
    is_global: true,
    company_id: null
  });

  useEffect(() => {
    fetchPricing();
    fetchClients();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchPricing = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/pricing`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      if (data.success) {
        setPricing(data.pricing);
      }
    } catch (err) {
      console.error('Fetch pricing error:', err);
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
      [name]: type === 'checkbox' ? checked : (name === 'monthly_price' ? parseFloat(value) : value)
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/pricing`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData)
      });

      const data = await response.json();
      if (data.success) {
        fetchPricing();
        setFormData({
          module_name: 'mail',
          monthly_price: 0,
          is_global: true,
          company_id: null
        });
        setEditingId(null);
      }
    } catch (err) {
      console.error('Submit pricing error:', err);
    }
  };

  if (loading) {
    return <div className="pricing-loading">Loading pricing...</div>;
  }

  return (
    <div className="pricing-management">
      <div className="pricing-header">
        <div className="pricing-header-content">
          <div>
            <h2>Pricing Management</h2>
            <p>Set module pricing globally or per client</p>
          </div>
          <button 
            className="back-btn"
            onClick={() => onNavigate('dashboard')}
          >
            ← Back to Dashboard
          </button>
        </div>
      </div>

      <div className="pricing-container">
        <div className="pricing-form">
          <h3>{editingId ? 'Edit Pricing' : 'Add Pricing'}</h3>
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Module</label>
              <select name="module_name" value={formData.module_name} onChange={handleInputChange}>
                <option value="mail">POMAR Mail</option>
                <option value="clash">POMAR Clash</option>
                <option value="vendors">POMAR Vendors</option>
                <option value="marketplace">POMAR Marketplace</option>
                <option value="trust">POMAR Trust</option>
                <option value="capital">POMAR Capital Tracker</option>
                <option value="daily_logs">POMAR Daily Logs</option>
              </select>
            </div>

            <div className="form-group">
              <label>Monthly Price</label>
              <input
                type="number"
                name="monthly_price"
                value={formData.monthly_price}
                onChange={handleInputChange}
                step="0.01"
              />
            </div>

            <div className="form-group checkbox">
              <label>
                <input
                  type="checkbox"
                  name="is_global"
                  checked={formData.is_global}
                  onChange={handleInputChange}
                />
                Global Pricing
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

            <button type="submit" className="submit-btn">Save Pricing</button>
          </form>
        </div>

        <div className="pricing-list">
          <h3>Current Pricing</h3>
          <div className="pricing-items">
            {pricing.map(item => (
              <div key={item.id} className="pricing-item">
                <div className="pricing-details">
                  <strong>{item.module_name}</strong>
                  <span>${item.monthly_price}/mo</span>
                  <span className="pricing-type">{item.is_global ? 'Global' : `Client: ${item.company_name || item.company_id}`}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
