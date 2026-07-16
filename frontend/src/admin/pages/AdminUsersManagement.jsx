import React, { useState, useEffect } from 'react';
import '../styles/AdminUsersManagement.css';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

export default function AdminUsersManagement({ token, onNavigate }) {
  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [message, setMessage] = useState('');
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    admin_level: 'super_admin'
  });

  useEffect(() => {
    fetchAdmins();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchAdmins = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/users`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      if (data.success) {
        setAdmins(data.admins);
      }
    } catch (err) {
      console.error('Fetch admins error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleCreateAdmin = async (e) => {
    e.preventDefault();
    setMessage('');

    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/users`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData)
      });

      const data = await response.json();

      if (data.success) {
        setMessage('✅ Admin user created successfully');
        setFormData({
          email: '',
          password: '',
          admin_level: 'super_admin'
        });
        setShowCreateForm(false);
        fetchAdmins();
      } else {
        setMessage(`❌ ${data.error}`);
      }
    } catch (err) {
      console.error('Create admin error:', err);
      setMessage('❌ Error creating admin user');
    }
  };

  const handleToggleActive = async (adminId, currentStatus) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/users/${adminId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ is_active: !currentStatus })
      });

      const data = await response.json();
      if (data.success) {
        fetchAdmins();
        setMessage('✅ Admin status updated');
      }
    } catch (err) {
      console.error('Toggle admin error:', err);
      setMessage('❌ Error updating admin');
    }
  };

  if (loading) {
    return <div className="admin-users-loading">Loading admin users...</div>;
  }

  return (
    <div className="admin-users-management">
      <div className="admin-users-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2>Admin Users</h2>
            <p>Create and manage admin accounts</p>
          </div>
          <button 
            onClick={() => onNavigate('dashboard')}
            style={{
              padding: '10px 20px',
              backgroundColor: '#0E1B2C',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer'
            }}
          >
            ← Back to Dashboard
          </button>
        </div>
      </div>

      <div className="admin-users-container">
        {!showCreateForm && (
          <button 
            className="create-admin-btn"
            onClick={() => setShowCreateForm(true)}
          >
            ➕ Create Admin User
          </button>
        )}

        {showCreateForm && (
          <div className="create-admin-form">
            <div className="form-header">
              <h3>Create New Admin User</h3>
              <button 
                className="close-form-btn"
                onClick={() => setShowCreateForm(false)}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateAdmin}>
              <div className="form-group">
                <label>Email *</label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  required
                />
              </div>

              <div className="form-group">
                <label>Password *</label>
                <input
                  type="password"
                  name="password"
                  value={formData.password}
                  onChange={handleInputChange}
                  required
                />
              </div>

              <div className="form-group">
                <label>Admin Level *</label>
                <select
                  name="admin_level"
                  value={formData.admin_level}
                  onChange={handleInputChange}
                >
                  <option value="super_admin">Super Admin</option>
                  <option value="admin">Admin</option>
                </select>
              </div>

              {message && (
                <div className={`form-message ${message.includes('✅') ? 'success' : 'error'}`}>
                  {message}
                </div>
              )}

              <button type="submit" className="submit-btn">Create Admin</button>
            </form>
          </div>
        )}

        <div className="admin-users-table-wrapper">
          <table className="admin-users-table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Level</th>
                <th>Client</th>
                <th>Status</th>
                <th>Last Login</th>
                <th>Created</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {admins.map(admin => (
                <tr key={admin.id} className="admin-row">
                  <td className="admin-email">{admin.email}</td>
                  <td className="admin-level">
                    <span className="level-badge">{admin.admin_level}</span>
                  </td>
                  <td className="admin-client">
                    {admin.client_name || 'N/A'}
                  </td>
                  <td className="admin-status">
                    <span className={`status-badge ${admin.is_active ? 'active' : 'inactive'}`}>
                      {admin.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="admin-last-login">
                    {admin.last_login 
                      ? new Date(admin.last_login).toLocaleDateString()
                      : 'Never'
                    }
                  </td>
                  <td className="admin-created">
                    {new Date(admin.created_at).toLocaleDateString()}
                  </td>
                  <td className="admin-action">
                    <button
                      className="toggle-btn"
                      onClick={() => handleToggleActive(admin.id, admin.is_active)}
                    >
                      {admin.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
