import React, { useState, useEffect } from 'react';
import AdminLogin from './AdminLogin';
import AdminDashboard from '../components/AdminDashboard';
import PricingManagement from './PricingManagement';
import FeatureFlagsManagement from './FeatureFlagsManagement';
import ClientsManagement from './ClientsManagement';
import AdminUsersManagement from './AdminUsersManagement';
import ActivityLogViewer from './ActivityLogViewer';
import AnalyticsDashboard from './AnalyticsDashboard';
import LogsManagement from './LogsManagement';
import RemovalRequestsQueue from './RemovalRequestsQueue';

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
    if (path.includes('/analytics')) return 'analytics';
    if (path.includes('/logs')) return 'logs';
    if (path.includes('/removal-requests')) return 'removal-requests';
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
      } else if (response.status === 401) {
        // Only a real auth failure (expired/invalid token) should log the
        // admin out. A transient 5xx (e.g. the backend still cold-starting
        // right after a deploy) shouldn't wipe a token that's actually
        // still valid — AdminDashboard's own fetch will retry.
        handleLogout();
      }
    } catch (err) {
      // Network error — leave the token in place rather than logging the
      // admin out for a blip; same reasoning as the 5xx case above.
      console.error('Token verification error:', err);
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
      'activity-log': '/admin/activity-log',
      'analytics': '/admin/analytics',
      logs: '/admin/logs',
      'removal-requests': '/admin/removal-requests'
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
      return <ClientsManagement token={token} admin={admin} onNavigate={handleNavigate} />;
    case 'users':
      return <AdminUsersManagement token={token} onNavigate={handleNavigate} />;
    case 'analytics':
      return <AnalyticsDashboard token={token} onNavigate={handleNavigate} />;
    case 'activity-log':
      return <ActivityLogViewer token={token} onNavigate={handleNavigate} />;
    case 'logs':
      return <LogsManagement token={token} admin={admin} onNavigate={handleNavigate} />;
    case 'removal-requests':
      return <RemovalRequestsQueue token={token} onNavigate={handleNavigate} />;
    default:
      return <AdminDashboard token={token} admin={admin} onLogout={handleLogout} onNavigate={handleNavigate} />;
  }
}
