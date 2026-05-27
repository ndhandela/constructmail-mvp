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
  const [currentPage, setCurrentPage] = useState(getPageFromURL());

  function getPageFromURL() {
    const path = window.location.pathname;
    if (path.includes('/pricing')) return 'pricing';
    if (path.includes('/flags')) return 'flags';
    if (path.includes('/clients')) return 'clients';
    if (path.includes('/users')) return 'users';
    if (path.includes('/activity-log')) return 'activity-log';
    return 'dashboard';
  }

  useEffect(() => {
    const savedToken = localStorage.getItem('admin_token');
    if (savedToken) {
      setToken(savedToken);
      verifyToken(savedToken);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
    window.history.pushState({}, '', '/admin/dashboard');
  };

  const handleLogout = () => {
    setToken(null);
    setAdmin(null);
    localStorage.removeItem('admin_token');
    setCurrentPage('login');
    window.location.href = '/admin/login';
  };

  const handleNavigate = (page) => {
    setCurrentPage(page);
    const pathMap = {
      dashboard: '/admin/dashboard',
      pricing: '/admin/pricing',
      flags: '/admin/flags',
      clients: '/admin/clients',
      users: '/admin/users',
      'activity-log': '/admin/activity-log'
    };
    window.history.pushState({}, '', pathMap[page]);
  };

  if (!token) {
    return <AdminLogin onLogin={handleLogin} />;
  }

  switch (currentPage) {
    case 'pricing':
      return <PricingManagement token={token} onNavigate={handleNavigate} />;
    case 'flags':
      return <FeatureFlagsManagement token={token} onNavigate={handleNavigate} />;
    case 'clients':
      return <ClientsManagement token={token} onNavigate={handleNavigate} />;
    case 'users':
      return <AdminUsersManagement token={token} onNavigate={handleNavigate} />;
    case 'activity-log':
      return <ActivityLogViewer token={token} onNavigate={handleNavigate} />;
    default:
      return <AdminDashboard token={token} admin={admin} onLogout={handleLogout} onNavigate={handleNavigate} />;
  }
}
