import React, { useState, useEffect } from 'react';
import '../styles/ClientsManagement.css';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

const ADD_COMPANY_TIMEOUT_MS = 15000;

function AddCompanyForm({ token, onCreated, onCancel }) {
  const [form, setForm] = useState({ companyName: '', ownerFullName: '', ownerEmail: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [emailSent, setEmailSent] = useState(true);

  const handleChange = (e) => setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), ADD_COMPANY_TIMEOUT_MS);

    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/companies`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(form),
        signal: controller.signal,
      });
      const data = await res.json();
      if (data.success) {
        setEmailSent(data.email_sent !== false);
        setSuccess(true);
        onCreated();
      } else {
        setError(data.detail || 'Could not create company.');
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        setError('Request timed out. The company may or may not have been created — check the list before retrying.');
      } else {
        setError('Network error. Try again.');
      }
    } finally {
      clearTimeout(timeoutId);
      setSaving(false);
    }
  };

  if (success) {
    return (
      <div>
        <h3>Company created</h3>
        {emailSent ? (
          <p>An invite email has been sent to {form.ownerEmail} to set their password.</p>
        ) : (
          <p className="modules-msg modules-msg--error">
            Company created, but invite email failed to send. You'll need to resend the invite to {form.ownerEmail} manually.
          </p>
        )}
        <button
          className="save-modules-btn"
          onClick={() => {
            if (onCancel) {
              onCancel();
            } else {
              setSuccess(false);
              setForm({ companyName: '', ownerFullName: '', ownerEmail: '' });
            }
          }}
        >
          {onCancel ? 'Done' : 'Add Another Company'}
        </button>
      </div>
    );
  }

  return (
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
        {onCancel && (
          <button type="button" className="back-btn" onClick={onCancel} disabled={saving}>Cancel</button>
        )}
        <button type="submit" className="save-modules-btn" disabled={saving}>
          {saving ? 'Creating…' : 'Create & Send Invite'}
        </button>
      </div>
    </form>
  );
}

function AddCompanyModal({ token, onClose, onCreated }) {
  return (
    <div className="add-company-modal-overlay" onClick={onClose}>
      <div className="add-company-modal" onClick={e => e.stopPropagation()}>
        <AddCompanyForm token={token} onCreated={onCreated} onCancel={onClose} />
      </div>
    </div>
  );
}

export default function ClientsManagement({ token, admin, onNavigate }) {
  const isSuperAdmin = admin?.admin_level === 'super_admin';
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(isSuperAdmin);
  const [pagination, setPagination] = useState({ offset: 0, limit: 20, total: 0 });
  const [expandedId, setExpandedId] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [statusState, setStatusState] = useState({});

  useEffect(() => {
    if (isSuperAdmin) fetchCompanies();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagination.offset, isSuperAdmin]);

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

  const handleToggleStatus = async (company) => {
    const newStatus = company.status === 'inactive' ? 'active' : 'inactive';
    setStatusState(prev => ({ ...prev, [company.id]: { updating: true, error: '' } }));
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/companies/${company.id}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await res.json();
      if (data.success) {
        await fetchCompanies();
        setStatusState(prev => ({ ...prev, [company.id]: { updating: false, error: '' } }));
      } else {
        setStatusState(prev => ({ ...prev, [company.id]: { updating: false, error: data.detail || 'Could not update status.' } }));
      }
    } catch (err) {
      console.error('Update company status error:', err);
      setStatusState(prev => ({ ...prev, [company.id]: { updating: false, error: 'Network error.' } }));
    }
  };

  const handleCompanyCreated = () => {
    if (isSuperAdmin) fetchCompanies();
  };

  const handleNextPage = () => setPagination(prev => ({ ...prev, offset: prev.offset + prev.limit }));
  const handlePrevPage = () => setPagination(prev => ({ ...prev, offset: Math.max(0, prev.offset - prev.limit) }));

  if (!isSuperAdmin) {
    return (
      <div className="clients-management">
        <div className="clients-header">
          <div className="clients-header-content">
            <div>
              <h2>Add Company</h2>
              <p>Create a new General Contractor company</p>
            </div>
            <button className="back-btn" onClick={() => onNavigate('dashboard')}>
              ← Back to Dashboard
            </button>
          </div>
        </div>

        <div className="clients-container">
          <div className="add-company-modal add-company-inline">
            <AddCompanyForm token={token} onCreated={handleCompanyCreated} />
          </div>
        </div>
      </div>
    );
  }

  if (loading) return <div className="clients-loading">Loading companies...</div>;

  const hasNextPage = pagination.offset + pagination.limit < pagination.total;
  const hasPrevPage = pagination.offset > 0;

  return (
    <div className="clients-management">
      <div className="clients-header">
        <div className="clients-header-content">
          <div>
            <h2>Companies</h2>
            <p>Manage General Contractor companies</p>
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
              {companies.map(company => {
                const isInactive = company.status === 'inactive';
                const rowStatusState = statusState[company.id] || {};
                return (
                  <React.Fragment key={company.id}>
                    <tr className="client-row">
                      <td className="client-name">{company.name || 'N/A'}</td>
                      <td className="client-email">{company.owner_email || 'N/A'}</td>
                      <td className="client-projects">{company.team_size}</td>
                      <td className="client-status">
                        <span className={`status-badge ${isInactive ? 'inactive' : 'active'}`}>
                          {isInactive ? 'Inactive' : 'Active'}
                        </span>
                      </td>
                      <td className="client-joined">
                        {new Date(company.created_at).toLocaleDateString()}
                      </td>
                      <td className="client-action">
                        <div className="client-action-buttons">
                          <button
                            className={`status-toggle-btn ${isInactive ? 'activate' : 'deactivate'}`}
                            onClick={() => handleToggleStatus(company)}
                            disabled={rowStatusState.updating}
                          >
                            {rowStatusState.updating ? '…' : isInactive ? 'Activate' : 'Deactivate'}
                          </button>
                          <button
                            className="expand-btn"
                            onClick={() => setExpandedId(expandedId === company.id ? null : company.id)}
                          >
                            {expandedId === company.id ? '▼' : '▶'}
                          </button>
                        </div>
                        {rowStatusState.error && (
                          <div className="modules-msg modules-msg--error">{rowStatusState.error}</div>
                        )}
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
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
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
