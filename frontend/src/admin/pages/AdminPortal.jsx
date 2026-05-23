import React, { useState, useEffect } from 'react';
import AdminLogin from './AdminLogin';
import AdminDashboard from '../components/AdminDashboard';
import PricingManagement from './PricingManagement';
import FeatureFlagsManagement from './FeatureFlagsManagement';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

export default function AdminPortal() {
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const path = window.location.pathname;

  useEffect(() => {
    // Check for stored token on mount
    const storedToken = localStorage.getItem('admin_token');
    if (storedToken) {
      // Verify token is still valid
      verifyToken(storedToken);
    } else {
      setLoading(false);
    }
  }, []);

  const verifyToken = async (testToken) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/me`, {
        headers: {
          'Authorization': `Bearer ${testToken}`
        }
      });

      if (response.ok) {
        setToken(testToken);
      } else {
        // Token invalid
        localStorage.removeItem('admin_token');
        localStorage.removeItem('admin_data');
      }
    } catch (err) {
      console.error('Token verification error:', err);
      localStorage.removeItem('admin_token');
      localStorage.removeItem('admin_data');
    } finally {
      setLoading(false);
    }
  };

  const handleLoginSuccess = (newToken) => {
    setToken(newToken);
    localStorage.setItem('admin_token', newToken);
  };

  const handleLogout = () => {
    setToken(null);
    localStorage.removeItem('admin_token');
    localStorage.removeItem('admin_data');
  };

  if (loading) {
    return <div style={{ padding: '50px', textAlign: 'center' }}>Loading...</div>;
  }

  // ── Login page ────────────────────────────────────────────────────────
  if (path === '/admin/login' || !token) {
    return <AdminLogin onLoginSuccess={handleLoginSuccess} />;
  }

  // ── Dashboard page ────────────────────────────────────────────────────
  if (path.startsWith('/admin/dashboard')) {
    return <AdminDashboard token={token} onLogout={handleLogout} />;
  }

  // ── Settings page (future) ────────────────────────────────────────────
  if (path.startsWith('/admin/settings')) {
    return <div style={{ padding: '50px' }}>Settings - Coming Soon</div>;
  }

  // ── Pricing Management page ───────────────────────────────────────────
  if (path === '/admin/pricing') {
    return <PricingManagement token={token} />;
  }

  // ── Feature Flags page ───────────────────────────────────────────────
  if (path === '/admin/flags') {
    return <FeatureFlagsManagement token={token} />;
  }

  // ── Default to dashboard ──────────────────────────────────────────────
  return <AdminDashboard token={token} onLogout={handleLogout} />;
}