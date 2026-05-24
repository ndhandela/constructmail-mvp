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
          {/* Pricing */}
          <div className="admin-section">
            <div className="section-icon">💰</div>
            <h3>Pricing Management</h3>
            <p>Set module pricing globally or per client</p>
            <button className="section-button" onClick={() => onNavigate('pricing')}>Manage Pricing</button>
          </div>

          {/* Feature Flags */}
          <div className="admin-section">
            <div className="section-icon">🚀</div>
            <h3>Feature Flags</h3>
            <p>Enable/disable features globally or per client</p>
            <button className="section-button" onClick={() => onNavigate('flags')}>Manage Flags</button>
          </div>

          {/* GC Clients */}
          <div className="admin-section">
            <div className="section-icon">👥</div>
            <h3>GC Clients</h3>
            <p>View and manage General Contractor accounts</p>
            <button className="section-button" onClick={() => onNavigate('clients')}>View Clients</button>
          </div>

          {/* Admin Users */}
          <div className="admin-section">
            <div className="section-icon">🔐</div>
            <h3>Admin Users</h3>
            <p>Create and manage admin accounts</p>
            <button className="section-button" onClick={() => onNavigate('users')}>Manage Admins</button>
          </div>

          {/* Activity Log */}
          <div className="admin-section">
            <div className="section-icon">📋</div>
            <h3>Activity Log</h3>
            <p>View audit trail of all admin actions</p>
            <button className="section-button" onClick={() => onNavigate('activity-log')}>View Activity</button>
          </div>
        </div>
      </div>
    </div>
  );
}
