import React, { useState, useEffect } from 'react';
import '../styles/PricingManagement.css';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

export default function PricingManagement({ token }) {
  const [pricing, setPricing] = useState({});
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const fetchPricing = useCallback(async () => {
    try {
      const defaultPricing = {
        mail: { price: 0, billing: 'monthly' },
        clash: { price: 0, billing: 'monthly' },
        vendors: { price: 0, billing: 'monthly' }
      };
      setPricing(defaultPricing);
    } catch (err) {
      console.error('Fetch pricing error:', err);
    }
  }, []);

  const fetchClients = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/clients`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setClients(data.clients || []);
      }
    } catch (err) {
      console.error('Fetch clients error:', err);
    }
  }, [token]);

  useEffect(() => {
    fetchPricing();
    fetchClients();
  }, [fetchPricing, fetchClients]);

  
  const handlePriceChange = (moduleKey, newPrice) => {
    setPricing(prev => ({
      ...prev,
      [moduleKey]: {
        ...prev[moduleKey],
        price: parseFloat(newPrice) || 0
      }
    }));
  };

  const handleSavePricing = async () => {
    setSaving(true);
    setMessage('');

    try {
      // Save each module pricing
      for (const [moduleKey, data] of Object.entries(pricing)) {
        const response = await fetch(`${API_BASE_URL}/api/admin/pricing`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            module_name: moduleKey,
            monthly_price: data.price,
            billing_cycle: data.billing,
            is_global: true
          })
        });

        if (!response.ok) {
          throw new Error(`Failed to save ${moduleKey} pricing`);
        }
      }

      setMessage('✅ Pricing updated successfully');
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      console.error('Save pricing error:', err);
      setMessage('❌ Failed to save pricing');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="pricing-loading">Loading pricing data...</div>;
  }

  return (
    <div className="pricing-management">
      <div className="pricing-header">
        <h2>Pricing Management</h2>
        <p>Configure module pricing globally or per client</p>
      </div>

      <div className="pricing-container">
        {/* Global Pricing Section */}
        <div className="pricing-section">
          <div className="section-header">
            <h3>Global Pricing</h3>
            <span className="section-badge">Applies to all new clients</span>
          </div>

          <div className="modules-grid">
            {modules.map(module => (
              <div key={module.name} className="module-card">
                <div className="module-header">
                  <h4>{module.label}</h4>
                  <p className="module-desc">{module.description}</p>
                </div>

                <div className="price-input-group">
                  <label>Monthly Price</label>
                  <div className="price-input-wrapper">
                    <span className="currency">$</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={pricing[module.name]?.price || 0}
                      onChange={(e) => handlePriceChange(module.name, e.target.value)}
                      placeholder="0.00"
                    />
                    <span className="period">/month</span>
                  </div>
                </div>

                <div className="module-status">
                  <span className="status-label">Status</span>
                  <span className="status-badge active">Active</span>
                </div>
              </div>
            ))}
          </div>

          {message && <div className={`message ${message.includes('✅') ? 'success' : 'error'}`}>{message}</div>}

          <button 
            className="save-button" 
            onClick={handleSavePricing}
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Save Pricing'}
          </button>
        </div>

        {/* Pricing Summary */}
        <div className="pricing-section">
          <div className="section-header">
            <h3>Current Rates</h3>
            <span className="section-badge">{Object.keys(pricing).length} modules</span>
          </div>

          <div className="pricing-summary">
            {modules.map(module => (
              <div key={module.name} className="summary-row">
                <span className="summary-label">{module.label}</span>
                <span className="summary-price">
                  ${pricing[module.name]?.price || 0}/month
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Client Pricing (Future) */}
        <div className="pricing-section">
          <div className="section-header">
            <h3>Client-Specific Pricing</h3>
            <span className="section-badge">{clients.length} clients</span>
          </div>

          {clients.length > 0 ? (
            <div className="clients-table">
              <table>
                <thead>
                  <tr>
                    <th>Client</th>
                    <th>Email</th>
                    <th>Active Modules</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {clients.map(client => (
                    <tr key={client.id}>
                      <td><strong>{client.name || 'N/A'}</strong></td>
                      <td>{client.email}</td>
                      <td>
                        <span className="module-count">
                          {client.active_modules ? Object.values(client.active_modules).filter(Boolean).length : 0} modules
                        </span>
                      </td>
                      <td>
                        <button className="action-button" disabled>Configure</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-state">
              <p>No clients yet. Pricing will apply to all new signups.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}