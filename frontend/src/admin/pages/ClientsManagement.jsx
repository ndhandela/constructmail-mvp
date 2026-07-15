import React, { useState, useEffect } from 'react';
import '../styles/ClientsManagement.css';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

const ALL_MODULES = [
  { key: 'mail',        label: 'POMAR Mail' },
  { key: 'clash',       label: 'POMAR Clash' },
  { key: 'vendors',     label: 'POMAR Vendors' },
  { key: 'marketplace', label: 'Marketplace' },
];

function ModuleToggles({ company, token, onModulesUpdated }) {
  const [modules, setModules] = useState({
    mail: false, clash: false, vendors: false, marketplace: false,
    ...(company.active_modules || {}),
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
      const res = await fetch(`${API_BASE_URL}/api/admin/companies/${company.id}/modules`, {
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
        if (onModulesUpdated) onModulesUpdated(company.id, data.active_modules);
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

function AddCompanyModal({ token, onClose, onCreated }) {
  const [form, setForm] = useState({ companyName: '', ownerFullName: '', ownerEmail: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleChange = (e) => setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/companies`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (data.success) {
        setSuccess(true);
        onCreated();
      } else {
        setError(data.detail || 'Could not create company.');
      }
    } catch {
      setError('Network error. Try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="add-company-modal-overlay" onClick={onClose}>
      <div className="add-company-modal" onClick={e => e.stopPropagation()}>
        {success ? (
          <div>
            <h3>Company created</h3>
            <p>An invite email has been sent to {form.ownerEmail} to set their password.</p>
            <button className="save-modules-btn" onClick={onClose}>Done</button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <h3>Add Company</h3>
            <div className="add-company-field">
              <label>Company Name</label>
              <input name="companyName" value={form.companyName} onChange={handleChange} required disabled={saving} />
            </div>
            <div className="add-company-field">
              <label>Owner Full Name</label>
              <input name="ownerFullName" value={form.ownerFullName} onChange={handleChange} required disabled={saving} />
            </div>
            <div className="add-company-field">
              <label>Owner Email</label>
              <input type="email" name="ownerEmail" value={form.ownerEmail} onChange={handleChange} required disabled={saving} />
            </div>
            {error && <div className="modules-msg modules-msg--error">{error}</div>}
            <div className="add-company-actions">
              <button type="button" className="back-btn" onClick={onClose} disabled={saving}>Cancel</button>
              <button type="submit" className="save-modules-btn" disabled={saving}>
                {saving ? 'Creating…' : 'Create & Send Invite'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export default function ClientsManagement({ token, onNavigate }) {
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ offset: 0, limit: 20, total: 0 });
  const [expandedId, setExpandedId] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);

  useEffect(() => {
    fetchCompanies();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagination.offset]);

  const fetchCompanies = async () => {
    setLoading(true);
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/admin/companies?limit=${pagination.limit}&offset=${pagination.offset}`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      const data = await response.json();
      if (data.success) {
        setCompanies(data.companies);
        setPagination(prev => ({ ...prev, total: data.total }));
      }
    } catch (err) {
      console.error('Fetch companies error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleModulesUpdated = (companyId, newModules) => {
    setCompanies(prev =>
      prev.map(c => c.id === companyId ? { ...c, active_modules: newModules } : c)
    );
  };

  const handleCompanyCreated = () => {
    fetchCompanies();
  };

  const handleNextPage = () => setPagination(prev => ({ ...prev, offset: prev.offset + prev.limit }));
  const handlePrevPage = () => setPagination(prev => ({ ...prev, offset: Math.max(0, prev.offset - prev.limit) }));

  if (loading) return <div className="clients-loading">Loading companies...</div>;

  const hasNextPage = pagination.offset + pagination.limit < pagination.total;
  const hasPrevPage = pagination.offset > 0;

  return (
    <div className="clients-management">
      <div className="clients-header">
        <div className="clients-header-content">
          <div>
            <h2>Companies</h2>
            <p>Manage General Contractor companies and their module access</p>
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <button className="save-modules-btn" onClick={() => setShowAddModal(true)}>
              + Add Company
            </button>
            <button className="back-btn" onClick={() => onNavigate('dashboard')}>
              ← Back to Dashboard
            </button>
          </div>
        </div>
      </div>

      <div className="clients-container">
        <div className="clients-table-wrapper">
          <table className="clients-table">
            <thead>
              <tr>
                <th>Company</th>
                <th>Owner Email</th>
                <th>Team Size</th>
                <th>Status</th>
                <th>Joined</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {companies.map(company => (
                <React.Fragment key={company.id}>
                  <tr className="client-row">
                    <td className="client-name">{company.name || 'N/A'}</td>
                    <td className="client-email">{company.owner_email || 'N/A'}</td>
                    <td className="client-projects">{company.team_size}</td>
                    <td className="client-status">
                      <span className="status-badge active">{company.status || 'Active'}</span>
                    </td>
                    <td className="client-joined">
                      {new Date(company.created_at).toLocaleDateString()}
                    </td>
                    <td className="client-action">
                      <button
                        className="expand-btn"
                        onClick={() => setExpandedId(expandedId === company.id ? null : company.id)}
                      >
                        {expandedId === company.id ? '▼' : '▶'}
                      </button>
                    </td>
                  </tr>

                  {expandedId === company.id && (
                    <tr className="client-details-row">
                      <td colSpan="6">
                        <div className="client-details">
                          <div className="detail-item">
                            <span className="detail-label">Company ID:</span>
                            <span className="detail-value">{company.id}</span>
                          </div>
                          <div className="detail-item">
                            <span className="detail-label">Team Size:</span>
                            <span className="detail-value">{company.team_size}</span>
                          </div>
                          <div className="detail-item detail-item--full">
                            <ModuleToggles
                              company={company}
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

      {showAddModal && (
        <AddCompanyModal
          token={token}
          onClose={() => setShowAddModal(false)}
          onCreated={handleCompanyCreated}
        />
      )}
    </div>
  );
}
