import React, { useState, useEffect } from 'react';
import '../styles/AdminDashboard.css';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

export default function AdminDashboard({ token, admin, onLogout, onNavigate }) {
  const [adminData, setAdmin] = useState(admin);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAdminData = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/admin/me`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        if (!response.ok) {
          onLogout();
          return;
        }

        const data = await response.json();
        setAdmin(data.admin);
      } catch (err) {
        console.error('Fetch admin error:', err);
        onLogout();
      } finally {
        setLoading(false);
      }
    };

    fetchAdminData();
  }, [token, onLogout]);

  if (loading) {
    return <div className="admin-loading">Loading...</div>;
  }

  return (
    <div className="admin-dashboard">
      <div className="admin-header">
        <h1>Admin Portal</h1>
        <div className="admin-info">
          <span>{adminData?.email}</span>
          <button className="logout-btn" onClick={onLogout}>Logout</button>
        </div>
      </div>

      <div className="admin-container">
        <div className="admin-grid">
          <div className="admin-section">
            <div className="section-icon">📊</div>
            <h3>Analytics</h3>
            <p>User signups, vendor stats, review trends</p>
            <button className="section-button" onClick={() => onNavigate('analytics')}>View Analytics</button>
          </div>

          {adminData?.admin_level === 'super_admin' && (
            <div className="admin-section">
              <div className="section-icon">💰</div>
              <h3>Pricing Management</h3>
              <p>Set module pricing globally or per client</p>
              <button className="section-button" onClick={() => onNavigate('pricing')}>Manage Pricing</button>
            </div>
          )}

          {adminData?.admin_level === 'super_admin' && (
            <div className="admin-section">
              <div className="section-icon">🚀</div>
              <h3>Feature Flags</h3>
              <p>Enable/disable features globally or per client</p>
              <button className="section-button" onClick={() => onNavigate('flags')}>Manage Flags</button>
            </div>
          )}

          <div className="admin-section">
            <div className="section-icon">🏢</div>
            <h3>Add Company</h3>
            <p>Create a new General Contractor company</p>
            <button className="section-button" onClick={() => onNavigate('clients')}>Add Company</button>
          </div>

          {adminData?.admin_level === 'super_admin' && (
            <div className="admin-section">
              <div className="section-icon">👥</div>
              <h3>Companies</h3>
              <p>View and manage General Contractor companies</p>
              <button className="section-button" onClick={() => onNavigate('clients')}>View Companies</button>
            </div>
          )}

          {adminData?.admin_level === 'super_admin' && (
            <div className="admin-section">
              <div className="section-icon">🔐</div>
              <h3>Admin Users</h3>
              <p>Create and manage admin accounts</p>
              <button className="section-button" onClick={() => onNavigate('users')}>Manage Admins</button>
            </div>
          )}

          <div className="admin-section">
            <div className="section-icon">📋</div>
            <h3>Logs</h3>
            <p>Server, frontend, email delivery, and admin activity logs</p>
            <button className="section-button" onClick={() => onNavigate('logs')}>View Logs</button>
          </div>
        </div>
      </div>
    </div>
  );
}
