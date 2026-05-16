import React, { useState, useEffect } from 'react';
import Login from './components/Login';
import LandingPage from './pages/LandingPage';
import PrivacyPolicy from './pages/PrivacyPolicy';
import Contact from './pages/Contact';
import Header from './components/Header';
import Footer from './components/Footer';
import AboutUs from './pages/AboutUs';

// Modules
import ConstructMailApp from './modules/constructmail/pages/ConstructMailApp';
import ClashAnalyzer from './modules/clash/pages/ClashAnalyzer';

import './styles/theme.css';
import './styles/components.css';
import './App.css';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

function App() {
  const [userId, setUserId] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [currentProduct, setCurrentProduct] = useState(null);

  const path = window.location.pathname;

  useEffect(() => {
    if (path === '/auth/gmail/callback') {
      const params = new URLSearchParams(window.location.search);
      const code = params.get('code');
      const error = params.get('error');
      if (window.opener && !window._gmailCallbackSent) {
        window._gmailCallbackSent = true;
        window.opener.postMessage({ type: 'GMAIL_CALLBACK', code, error }, '*');
        setTimeout(() => window.close(), 500);
      }
      return;
    }

    if (['/privacy', '/about', '/contact', '/clash'].includes(path)) {
      setLoading(false);
      return;
    }

    const verifyTokenFn = async (token) => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/auth/verify-token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token })
        });
        const data = await response.json();
        if (data.success) {
          setUserId(data.userId);
          localStorage.setItem('constructmail_userId', data.userId);
          fetchUser(data.userId);
          setCurrentProduct('constructmail');
          window.history.replaceState({}, document.title, window.location.pathname);
        } else {
          alert('Login failed: ' + data.error);
          setLoading(false);
        }
      } catch (err) {
        console.error('Token verification error:', err);
        alert('Login failed: ' + err.message);
        setLoading(false);
      }
    };

    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    const savedUserId = localStorage.getItem('constructmail_userId');

    if (token) {
      verifyTokenFn(token);
    } else if (savedUserId) {
      setUserId(savedUserId);
      fetchUser(savedUserId);
    } else {
      setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    if (userId) {
      if (path.includes('/constructmail')) setCurrentProduct('constructmail');
      if (path.includes('/clash')) setCurrentProduct('clash');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const fetchUser = async (uid) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/me?userId=${uid}`);
      const data = await response.json();
      setUser(data);
      setLoading(false);
    } catch (err) {
      console.error('Fetch user error:', err);
      setLoading(false);
    }
  };

  const handleLogout = () => {
    setUserId(null);
    setUser(null);
    setCurrentProduct(null);
    localStorage.removeItem('constructmail_userId');
  };

  const handleProductSelect = (productId) => {
    setCurrentProduct(productId);
  };

  if (path === '/privacy') {
    return (
      <>
        <Header userId={userId} onLogout={handleLogout} />
        <PrivacyPolicy />
        <Footer />
      </>
    );
  }

  if (path === '/about') {
    return (
      <>
        <Header userId={userId} onLogout={handleLogout} />
        <AboutUs />
        <Footer />
      </>
    );
  }

  if (path === '/contact') {
    return (
      <>
        <Header userId={userId} onLogout={handleLogout} />
        <Contact />
        <Footer />
      </>
    );
  }

  if (path === '/clash') {
    return (
      <>
        <Header userId={userId} onLogout={handleLogout} />
        <ClashAnalyzer />
        <Footer />
      </>
    );
  }

  if (loading) {
    return <div style={{ padding: '50px', textAlign: 'center' }}>Loading...</div>;
  }

  if (path === '/login') {
    return (
      <>
        <Header userId={null} onLogout={null} />
        <Login onLoginSuccess={(uid) => {
          setUserId(uid);
          window.location.href = '/constructmail';
        }} />
        <Footer />
      </>
    );
  }

  if (!currentProduct) {
    return (
      <>
        <Header userId={userId} onLogout={handleLogout} />
        <LandingPage onProductSelect={handleProductSelect} />
        <Footer />
      </>
    );
  }

  if (!userId && currentProduct) {
    window.location.href = '/login';
    return null;
  }

  if (currentProduct === 'constructmail') {
    return (
      <>
        <Header userId={userId} onLogout={handleLogout} />
        <ConstructMailApp user={user} userId={userId} onLogout={handleLogout} />
        <Footer />
      </>
    );
  }

  return <div>Unknown product</div>;
}

export default App;
