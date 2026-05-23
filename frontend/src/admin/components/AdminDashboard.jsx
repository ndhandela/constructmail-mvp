import React, { useState, useEffect } from 'react';
import '../styles/AdminDashboard.css';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

export default function AdminDashboard({ token, onLogout }) {
  const [admin, setAdmin] = useState(null);
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
          window.location.href = '/admin/login';
          return;
        }

        const data = await response.json();
        setAdmin(data.admin);
      } catch (err) {
        console.error('Fetch admin error:', err);
        onLogout();
        window.location.href = '/admin/login';
      } finally {
        setLoading(false);
      }
    };

    fetchAdminData();
  }, [token, onLogout]);

  const handleLogout = async () => {
    try {
      await fetch(`${API_BASE_URL}/api/admin/auth/logout`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
    } catch (err) {
      console.error('Logout error:', err);
    } finally {
      onLogout();
      window.location.href = '/admin/login';
    }
  };

  if (loading) {
    return <div className="admin-loading">Loading...</div>;
  }

  if (!admin) {
    return <div className="admin-loading">Admin data not found</div>;
  }

  return (
    <div className="admin-dashboard">
      <header className="admin-header">
        <div className="admin-header-left">
          <h1>POMAR Admin Portal</h1>
        </div>
        <div className="admin-user-menu">
          <span className="admin-email">{admin.email}</span>
          <span className="admin-level">
            {admin.admin_level === 'super_admin' ? 'Super Admin' : 'Client Admin'}
          </span>
          <button className="logout-button" onClick={handleLogout}>
            Logout
          </button>
        </div>
      </header>

      <div className="admin-content">
        <div className="welcome-box">
          <h2>Welcome to POMAR Admin</h2>
          <p>Manage pricing, features, users, and analytics from here.</p>
        </div>

        <div className="admin-sections">
            <div className="admin-section">
            <div className="section-icon">💰</div>
            <h3>Pricing Management</h3>
            <p>Configure module pricing for POMAR Mail, Clash, and Vendors</p>
            <button 
                className="section-button"
                onClick={() => window.location.href = '/admin/pricing'}
            >
                Manage Pricing
            </button>
            </div>

            <div className="admin-section">
            <div className="section-icon">🚀</div>
            <h3>Feature Flags</h3>
            <p>Enable/disable features globally or per client</p>
            <button 
                className="section-button"
                onClick={() => window.location.href = '/admin/flags'}
            >
                Manage Flags
            </button>
            </div>

          <div className="admin-section">
            <div className="section-icon">👥</div>
            <h3>User Management</h3>
            <p>Manage GC users, admin users, and vendor accounts</p>
            <button className="section-button" disabled>Coming Soon</button>
          </div>

          <div className="admin-section">
            <div className="section-icon">📊</div>
            <h3>Analytics</h3>
            <p>View platform metrics and usage analytics</p>
            <button className="section-button" disabled>Coming Soon</button>
          </div>
        </div>
      </div>
    </div>
  );
}