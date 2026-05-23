import React, { useState, useEffect } from 'react';
import '../styles/FeatureFlagsManagement.css';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

const DEFAULT_FEATURES = [
  {
    key: 'email_auto_discovery',
    name: 'Email Auto-Discovery',
    module: 'mail',
    description: 'Automatically discover and sync emails from Gmail/Outlook',
    enabled: true
  },
  {
    key: 'email_summarization',
    name: 'Email Summarization',
    module: 'mail',
    description: 'AI-powered email thread summarization',
    enabled: true
  },
  {
    key: 'action_extraction',
    name: 'Action Item Extraction',
    module: 'mail',
    description: 'Automatic extraction of action items from emails',
    enabled: true
  },
  {
    key: 'rfi_detection',
    name: 'RFI/Change Order Detection',
    module: 'mail',
    description: 'Detect RFI and change order signals in emails',
    enabled: true
  },
  {
    key: 'clash_analysis',
    name: 'Clash Analysis',
    module: 'clash',
    description: 'BIM clash detection and severity scoring',
    enabled: true
  },
  {
    key: 'clash_rfi_draft',
    name: 'Clash RFI Auto-Draft',
    module: 'clash',
    description: 'Automatically draft RFI from clash conflicts',
    enabled: true
  },
  {
    key: 'vendor_claiming',
    name: 'Vendor Profile Claiming',
    module: 'vendors',
    description: 'Allow vendors to claim and manage their profiles',
    enabled: true
  },
  {
    key: 'vendor_reviews',
    name: 'Vendor Anonymous Reviews',
    module: 'vendors',
    description: 'GCs can leave anonymous reviews for vendors',
    enabled: true
  },
  {
    key: 'vendor_csv_import',
    name: 'CSV Bulk Import',
    module: 'vendors',
    description: 'Bulk import vendors via CSV file',
    enabled: true
  }
];

export default function FeatureFlagsManagement({ token }) {
  const [features, setFeatures] = useState(DEFAULT_FEATURES);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [selectedModule, setSelectedModule] = useState('all');

  const modules = ['mail', 'clash', 'vendors'];

  useEffect(() => {
    fetchFeatureFlags();
  }, [token]);

  const fetchFeatureFlags = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/feature-flags`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        if (data.flags && data.flags.length > 0) {
          setFeatures(data.flags);
        }
      }
    } catch (err) {
      console.error('Fetch feature flags error:', err);
      // Use defaults if fetch fails
    } finally {
      setLoading(false);
    }
  };

  const handleToggleFeature = (featureKey) => {
    setFeatures(prev =>
      prev.map(f =>
        f.key === featureKey ? { ...f, enabled: !f.enabled } : f
      )
    );
  };

  const handleSaveFlags = async () => {
    setSaving(true);
    setMessage('');

    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/feature-flags`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ flags: features })
      });

      if (!response.ok) {
        throw new Error('Failed to save feature flags');
      }

      setMessage('✅ Feature flags updated successfully');
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      console.error('Save feature flags error:', err);
      setMessage('❌ Failed to save feature flags');
    } finally {
      setSaving(false);
    }
  };

  const filteredFeatures = selectedModule === 'all'
    ? features
    : features.filter(f => f.module === selectedModule);

  const getModuleColor = (module) => {
    const colors = {
      mail: '#D97706',
      clash: '#0E1B2C',
      vendors: '#475569'
    };
    return colors[module] || '#0E1B2C';
  };

  const getModuleLabel = (module) => {
    const labels = {
      mail: 'POMAR Mail',
      clash: 'POMAR Clash',
      vendors: 'POMAR Vendors'
    };
    return labels[module] || module;
  };

  if (loading) {
    return <div className="flags-loading">Loading feature flags...</div>;
  }

  return (
    <div className="feature-flags-management">
      <div className="flags-header">
        <h2>Feature Flags Management</h2>
        <p>Enable or disable features globally for all clients</p>
      </div>

      <div className="flags-container">
        {/* Filter Section */}
        <div className="flags-section">
          <div className="section-header">
            <h3>Filter by Module</h3>
          </div>

          <div className="module-filters">
            <button
              className={`filter-button ${selectedModule === 'all' ? 'active' : ''}`}
              onClick={() => setSelectedModule('all')}
            >
              All Features ({features.length})
            </button>
            {modules.map(module => (
              <button
                key={module}
                className={`filter-button ${selectedModule === module ? 'active' : ''}`}
                onClick={() => setSelectedModule(module)}
                style={{
                  borderColor: selectedModule === module ? getModuleColor(module) : '#F0DDC4'
                }}
              >
                {getModuleLabel(module)} ({features.filter(f => f.module === module).length})
              </button>
            ))}
          </div>
        </div>

        {/* Features Grid */}
        <div className="flags-section">
          <div className="section-header">
            <h3>
              {selectedModule === 'all' ? 'All Features' : getModuleLabel(selectedModule)}
            </h3>
            <span className="section-badge">{filteredFeatures.length} features</span>
          </div>

          <div className="features-grid">
            {filteredFeatures.map(feature => (
              <div key={feature.key} className="feature-card">
                <div className="feature-header">
                  <div>
                    <h4>{feature.name}</h4>
                    <div className="feature-meta">
                      <span
                        className="module-tag"
                        style={{
                          backgroundColor: getModuleColor(feature.module),
                          color: 'white'
                        }}
                      >
                        {getModuleLabel(feature.module)}
                      </span>
                    </div>
                  </div>

                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={feature.enabled}
                      onChange={() => handleToggleFeature(feature.key)}
                    />
                    <span className="toggle-slider"></span>
                  </label>
                </div>

                <p className="feature-description">{feature.description}</p>

                <div className="feature-status">
                  <span className={`status-badge ${feature.enabled ? 'enabled' : 'disabled'}`}>
                    {feature.enabled ? '✓ Enabled' : '✗ Disabled'}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {message && (
            <div className={`message ${message.includes('✅') ? 'success' : 'error'}`}>
              {message}
            </div>
          )}

          <button
            className="save-button"
            onClick={handleSaveFlags}
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Save Feature Flags'}
          </button>
        </div>

        {/* Summary Section */}
        <div className="flags-section">
          <div className="section-header">
            <h3>Status Summary</h3>
          </div>

          <div className="summary-grid">
            {modules.map(module => {
              const moduleFeatures = features.filter(f => f.module === module);
              const enabledCount = moduleFeatures.filter(f => f.enabled).length;
              const totalCount = moduleFeatures.length;

              return (
                <div key={module} className="summary-card">
                  <div
                    className="summary-header"
                    style={{
                      borderColor: getModuleColor(module)
                    }}
                  >
                    <h4>{getModuleLabel(module)}</h4>
                  </div>

                  <div className="summary-stats">
                    <div className="stat">
                      <span className="stat-label">Enabled</span>
                      <span className="stat-value enabled">{enabledCount}</span>
                    </div>
                    <div className="stat">
                      <span className="stat-label">Disabled</span>
                      <span className="stat-value disabled">{totalCount - enabledCount}</span>
                    </div>
                    <div className="stat">
                      <span className="stat-label">Total</span>
                      <span className="stat-value">{totalCount}</span>
                    </div>
                  </div>

                  <div className="summary-progress">
                    <div className="progress-bar">
                      <div
                        className="progress-fill"
                        style={{
                          width: `${(enabledCount / totalCount) * 100}%`,
                          backgroundColor: getModuleColor(module)
                        }}
                      ></div>
                    </div>
                    <span className="progress-text">
                      {Math.round((enabledCount / totalCount) * 100)}% enabled
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}