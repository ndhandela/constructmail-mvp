import React, { useState } from 'react';
import '../styles/AddVendorForm.css';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

const TRADES = [
  'Electrical',
  'Plumbing',
  'HVAC',
  'Concrete',
  'Steel',
  'Framing',
  'Roofing',
  'Painting',
  'Drywall',
  'Flooring',
  'Masonry',
  'Excavation'
];

const STATES = ['TX', 'OK', 'AR', 'LA', 'NM', 'CO', 'KS', 'NE', 'MO'];

const INSURANCE_STATUS = [
  { value: 'not_verified', label: 'Not Verified' },
  { value: 'pending', label: 'Pending Verification' },
  { value: 'verified', label: 'Verified' }
];

export default function AddVendorForm({ onVendorAdded }) {
  const [formData, setFormData] = useState({
    name: '',
    trade: '',
    phone: '',
    email: '',
    address: '',
    city: 'Dallas',
    state: 'TX',
    zip: '',
    website: '',
    insurance_status: 'not_verified'
  });

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [showForm, setShowForm] = useState(false);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    try {
      // Validate required fields
      if (!formData.name.trim()) {
        setMessage('❌ Vendor name is required');
        setLoading(false);
        return;
      }

      if (!formData.trade) {
        setMessage('❌ Trade is required');
        setLoading(false);
        return;
      }

      const response = await fetch(`${API_BASE_URL}/api/vendors`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData)
      });

      const data = await response.json();

      if (data.success) {
        setMessage(`✅ ${formData.name} added successfully!`);
        
        // Reset form
        setFormData({
          name: '',
          trade: '',
          phone: '',
          email: '',
          address: '',
          city: 'Dallas',
          state: 'TX',
          zip: '',
          website: '',
          insurance_status: 'not_verified'
        });

        // Close form after 2 seconds
        setTimeout(() => {
          setShowForm(false);
          if (onVendorAdded) {
            onVendorAdded();
          }
        }, 1500);
      } else {
        setMessage(`❌ ${data.error || 'Failed to add vendor'}`);
      }
    } catch (err) {
      console.error('Submit error:', err);
      setMessage('❌ Error adding vendor - check console');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setFormData({
      name: '',
      trade: '',
      phone: '',
      email: '',
      address: '',
      city: 'Dallas',
      state: 'TX',
      zip: '',
      website: '',
      insurance_status: 'not_verified'
    });
    setMessage('');
  };

  return (
    <div className="add-vendor-form-wrapper">
      <button 
        className="add-vendor-toggle"
        onClick={() => setShowForm(!showForm)}
      >
        {showForm ? '✕ Cancel' : '➕ Add Single Vendor'}
      </button>

      {showForm && (
        <div className="add-vendor-form-container">
          <div className="form-header">
            <h3>Add New Vendor</h3>
            <p>Fill in the details below to add a vendor to the network</p>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="form-grid">
              {/* Name */}
              <div className="form-group">
                <label>Vendor Name *</label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleInputChange}
                  placeholder="e.g., ABC Electrical"
                  disabled={loading}
                  required
                />
              </div>

              {/* Trade */}
              <div className="form-group">
                <label>Trade *</label>
                <select
                  name="trade"
                  value={formData.trade}
                  onChange={handleInputChange}
                  disabled={loading}
                  required
                >
                  <option value="">Select a trade</option>
                  {TRADES.map(trade => (
                    <option key={trade} value={trade}>{trade}</option>
                  ))}
                </select>
              </div>

              {/* Phone */}
              <div className="form-group">
                <label>Phone</label>
                <input
                  type="tel"
                  name="phone"
                  value={formData.phone}
                  onChange={handleInputChange}
                  placeholder="972-555-1234"
                  disabled={loading}
                />
              </div>

              {/* Email */}
              <div className="form-group">
                <label>Email</label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  placeholder="contact@vendor.com"
                  disabled={loading}
                />
              </div>

              {/* Address */}
              <div className="form-group form-span-2">
                <label>Address</label>
                <input
                  type="text"
                  name="address"
                  value={formData.address}
                  onChange={handleInputChange}
                  placeholder="123 Main Street"
                  disabled={loading}
                />
              </div>

              {/* City */}
              <div className="form-group">
                <label>City *</label>
                <input
                  type="text"
                  name="city"
                  value={formData.city}
                  onChange={handleInputChange}
                  placeholder="Dallas"
                  disabled={loading}
                  required
                />
              </div>

              {/* State */}
              <div className="form-group">
                <label>State</label>
                <select
                  name="state"
                  value={formData.state}
                  onChange={handleInputChange}
                  disabled={loading}
                >
                  {STATES.map(state => (
                    <option key={state} value={state}>{state}</option>
                  ))}
                </select>
              </div>

              {/* Zip */}
              <div className="form-group">
                <label>ZIP Code</label>
                <input
                  type="text"
                  name="zip"
                  value={formData.zip}
                  onChange={handleInputChange}
                  placeholder="75201"
                  disabled={loading}
                />
              </div>

              {/* Website */}
              <div className="form-group">
                <label>Website</label>
                <input
                  type="url"
                  name="website"
                  value={formData.website}
                  onChange={handleInputChange}
                  placeholder="https://vendor.com"
                  disabled={loading}
                />
              </div>

              {/* Insurance Status */}
              <div className="form-group">
                <label>Insurance Status</label>
                <select
                  name="insurance_status"
                  value={formData.insurance_status}
                  onChange={handleInputChange}
                  disabled={loading}
                >
                  {INSURANCE_STATUS.map(status => (
                    <option key={status.value} value={status.value}>
                      {status.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {message && (
              <div className={`form-message ${message.includes('✅') ? 'success' : 'error'}`}>
                {message}
              </div>
            )}

            <div className="form-actions">
              <button
                type="submit"
                className="submit-btn"
                disabled={loading}
              >
                {loading ? 'Adding...' : 'Add Vendor'}
              </button>
              <button
                type="button"
                className="reset-btn"
                onClick={handleReset}
                disabled={loading}
              >
                Clear
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}