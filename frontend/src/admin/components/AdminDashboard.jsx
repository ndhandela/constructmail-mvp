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
          <div className="admin-section" onClick={() => onNavigate('analytics')}>
            <div className="section-icon">📊</div>
            <h3>Analytics</h3>
            <p>User signups, vendor stats, review trends</p>
          </div>

          {adminData?.admin_level === 'super_admin' && (
            <div className="admin-section" onClick={() => onNavigate('pricing')}>
              <div className="section-icon">💰</div>
              <h3>Pricing Management</h3>
              <p>Set module pricing globally or per client</p>
            </div>
          )}

          {adminData?.admin_level === 'super_admin' && (
            <div className="admin-section" onClick={() => onNavigate('flags')}>
              <div className="section-icon">🚀</div>
              <h3>Feature Flags</h3>
              <p>Enable/disable features globally or per client</p>
            </div>
          )}

          <div className="admin-section" onClick={() => onNavigate('clients')}>
            <div className="section-icon">👥</div>
            <h3>Companies</h3>
            <p>Add and manage General Contractor companies</p>
          </div>

          {adminData?.admin_level === 'super_admin' && (
            <div className="admin-section" onClick={() => onNavigate('users')}>
              <div className="section-icon">🔐</div>
              <h3>Admin Users</h3>
              <p>Create and manage admin accounts</p>
            </div>
          )}

          <div className="admin-section" onClick={() => onNavigate('logs')}>
            <div className="section-icon">📋</div>
            <h3>Logs</h3>
            <p>Server, frontend, email delivery, and admin activity logs</p>
          </div>
        </div>
      </div>
    </div>
  );
}
