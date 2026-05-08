import React, { useState, useEffect } from 'react';
import Login from './components/Login';
import LandingPage from './pages/LandingPage';
import ConstructMailApp from './pages/ConstructMailApp';
import './theme.css';
import './styles/components.css';
import './App.css';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

function App() {
  const [userId, setUserId] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [currentProduct, setCurrentProduct] = useState(null);

  useEffect(() => {

    // Handle Gmail OAuth callback
      if (window.location.pathname === '/auth/gmail/callback') {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const error = params.get('error');
    
      if (window.opener && !window._gmailCallbackSent) {
        window._gmailCallbackSent = true;
        window.opener.postMessage(
          { type: 'GMAIL_CALLBACK', code, error },
          window.location.origin
        );
        setTimeout(() => window.close(), 500);
      }
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

    // Check if user is already logged in (from URL or localStorage)
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
  }, []);

  // NEW useEffect - Handle URL-based routing
  useEffect(() => {
    if (userId) { // Only check path if user is logged in
      const path = window.location.pathname;
      if (path.includes('/constructmail')) {
        setCurrentProduct('constructmail');
      }
    }
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
  
  if (loading) {
    return <div style={{ padding: '50px', textAlign: 'center' }}>Loading...</div>;
  }

  if (!userId) {
    return <Login onLoginSuccess={() => {}} />;
  }

  // User is logged in
  if (!currentProduct) {
    // Show landing page with product cards
    return <LandingPage onProductSelect={handleProductSelect} />;
  }

  // User selected a product - show that product
  if (currentProduct === 'constructmail') {
    return (
      <ConstructMailApp 
        user={user} 
        userId={userId} 
        onLogout={handleLogout}
      />
    );
  }

  return <div>Unknown product</div>;
}

export default App;