import React, { useState, useEffect } from 'react';
import AdminLogin from './AdminLogin';
import AdminDashboard from '../components/AdminDashboard';
import PricingManagement from './PricingManagement';
import FeatureFlagsManagement from './FeatureFlagsManagement';
import ClientsManagement from './ClientsManagement';
import AdminUsersManagement from './AdminUsersManagement';
import ActivityLogViewer from './ActivityLogViewer';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

export default function AdminPortal() {
  const [token, setToken] = useState(localStorage.getItem('admin_token'));
  const [admin, setAdmin] = useState(null);
  const [currentPage, setCurrentPage] = useState('dashboard');

  useEffect(() => {
    const savedToken = localStorage.getItem('admin_token');
    if (savedToken) {
      setToken(savedToken);
      verifyToken(savedToken);
    }
  }, []);

  const verifyToken = async (adminToken) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/me`, {
        headers: {
          'Authorization': `Bearer ${adminToken}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setAdmin(data.admin);
      } else {
        handleLogout();
      }
    } catch (err) {
      console.error('Token verification error:', err);
      handleLogout();
    }
  };

  const handleLogin = (newToken, adminData) => {
    setToken(newToken);
    setAdmin(adminData);
    localStorage.setItem('admin_token', newToken);
    setCurrentPage('dashboard');
  };

  const handleLogout = () => {
    setToken(null);
    setAdmin(null);
    localStorage.removeItem('admin_token');
    setCurrentPage('login');
    window.location.href = '/admin/login';
  };

  if (!token) {
    return <AdminLogin onLogin={handleLogin} />;
  }

  // Render based on currentPage state
  switch (currentPage) {
    case 'pricing':
      return <PricingManagement token={token} />;
    case 'flags':
      return <FeatureFlagsManagement token={token} />;
    case 'clients':
      return <ClientsManagement token={token} />;
    case 'users':
      return <AdminUsersManagement token={token} />;
    case 'activity-log':
      return <ActivityLogViewer token={token} />;
    default:
      return <AdminDashboard token={token} admin={admin} onLogout={handleLogout} onNavigate={setCurrentPage} />;
  }
}
