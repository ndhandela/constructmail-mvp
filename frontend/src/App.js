import React, { useState, useEffect } from 'react';
import { ProjectProvider } from './contexts/ProjectContext';
import Auth from './modules/shared/auth/Auth';
import SelectRole from './modules/shared/auth/SelectRole';
import LandingPage from './pages/LandingPage';
import PrivacyPolicy from './pages/PrivacyPolicy';
import Contact from './pages/Contact';
import Pricing from './pages/Pricing';
import Demo from './pages/Demo';
import MailMarketing from './pages/marketing/MailMarketing';
import ClashMarketing from './pages/marketing/ClashMarketing';
import VendorsMarketing from './pages/marketing/VendorsMarketing';
import MarketplaceMarketing from './pages/marketing/MarketplaceMarketing';
import Header from './components/Header';
import Footer from './components/Footer';
import ProjectGate from './components/ProjectGate';
import AboutUs from './pages/AboutUs';
import ResetPassword from './pages/ResetPassword';
import AcceptInvite from './pages/AcceptInvite';
import AdminPortal from './admin/pages/AdminPortal';
import VendorsApp from './modules/vendors/pages/VendorsApp';
import ConnectApp from './modules/connect/pages/ConnectApp';
import MarketplaceApp from './modules/marketplace/pages/MarketplaceApp';
import ProfileApp from './modules/profile/pages/ProfileApp';

// Modules
import ConstructMailApp from './modules/constructmail/pages/ConstructMailApp';
import ClashAnalyzer from './modules/clash/pages/ClashAnalyzer';
import ProductDashboard from './pages/Dashboard';

import './styles/theme.css';
import './styles/components.css';
import './App.css';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';
const PRODUCT_PATHS = ['/clash', '/mail', '/dashboard', '/vendors', '/connect', '/marketplace', '/profile'];

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
          if (path === '/clash') setCurrentProduct('clash');
          else if (path === '/connect') setCurrentProduct('connect');
          else setCurrentProduct('dashboard');
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  useEffect(() => {
    if (userId) {
      if (path === '/mail') setCurrentProduct('constructmail');
      if (path === '/clash') setCurrentProduct('clash');
      if (path === '/vendors') setCurrentProduct('vendors');
      if (path === '/dashboard') setCurrentProduct('dashboard');
      if (path === '/connect') setCurrentProduct('connect');
      if (path === '/marketplace') setCurrentProduct('marketplace');
      if (path === '/profile') setCurrentProduct('profile');
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

  // ── Auth loading ─────────────────────────────────────────────────────────
  // Static/public routes still wait for this — otherwise Header would render
  // once immediately with userId=null (before localStorage/token resolution
  // finishes) and always show the logged-out state on these pages.
  if (loading) {
    return <div style={{ padding: '50px', textAlign: 'center' }}>Loading...</div>;
  }

  // ── Static no-auth routes ────────────────────────────────────────────────
  if (path === '/privacy') {
    return (
      <>
        <Header userId={userId} onLogout={handleLogout} user={user} />
        <PrivacyPolicy />
        <Footer />
      </>
    );
  }

  if (path === '/about') {
    return (
      <>
        <Header userId={userId} onLogout={handleLogout} user={user} />
        <AboutUs />
        <Footer />
      </>
    );
  }

  if (path === '/contact') {
    return (
      <>
        <Header userId={userId} onLogout={handleLogout} user={user} />
        <Contact />
        <Footer />
      </>
    );
  }

  if (path === '/pricing') {
    return (
      <>
        <Header userId={userId} onLogout={handleLogout} user={user} />
        <Pricing />
        <Footer />
      </>
    );
  }

  if (path === '/demo') {
    return (
      <>
        <Header userId={userId} onLogout={handleLogout} user={user} />
        <Demo />
        <Footer />
      </>
    );
  }

  // ── Legacy path redirect ─────────────────────────────────────────────────
  if (path === '/constructmail') {
    window.location.href = '/mail' + window.location.search + window.location.hash;
    return null;
  }

  // ── Public product marketing pages (no auth required) ────────────────────
  if (path === '/mail-info') {
    return (
      <>
        <Header userId={userId} onLogout={handleLogout} user={user} />
        <MailMarketing />
        <Footer />
      </>
    );
  }

  if (path === '/clash-info') {
    return (
      <>
        <Header userId={userId} onLogout={handleLogout} user={user} />
        <ClashMarketing />
        <Footer />
      </>
    );
  }

  if (path === '/vendors-info') {
    return (
      <>
        <Header userId={userId} onLogout={handleLogout} user={user} />
        <VendorsMarketing />
        <Footer />
      </>
    );
  }

  if (path === '/marketplace-info') {
    return (
      <>
        <Header userId={userId} onLogout={handleLogout} user={user} />
        <MarketplaceMarketing />
        <Footer />
      </>
    );
  }

  // ── Login route ──────────────────────────────────────────────────────────
  if (path === '/login') {
    return (
      <>
        <Header userId={null} onLogout={null} />
        <Auth onLoginSuccess={(uid) => {
          setUserId(uid);
          localStorage.setItem("constructmail_userId", uid);
          const dest = sessionStorage.getItem('postLoginPath') || '/dashboard';
          sessionStorage.removeItem('postLoginPath');
          window.location.href = dest;
        }} />
        <Footer />
      </>
    );
  }

  if (path === '/reset-password') {
  return (
    <>
      <Header userId={userId} onLogout={handleLogout} user={user} />
      <ResetPassword />
      <Footer />
    </>
  );
}

  if (path === '/accept-invite') {
    return (
      <>
        <Header userId={null} onLogout={null} />
        <AcceptInvite />
        <Footer />
      </>
    );
  }

  // ── Logged-out user hitting a product route — redirect to login ──────────
  if (!userId && PRODUCT_PATHS.includes(path)) {
    sessionStorage.setItem('postLoginPath', path);
    window.location.href = '/login';
    return null;
  }

  // ── Magic-link users have no role yet — collect it before anything else ──
  // (role gates project creation, so this has to happen before /dashboard or
  // any other product route can render).
  if (userId && user && !user.role && PRODUCT_PATHS.includes(path)) {
    return (
      <>
        <Header userId={userId} onLogout={handleLogout} user={user} />
        <SelectRole
          userId={userId}
          onRoleSelected={(role) => {
            setUser((prev) => ({ ...prev, role }));
          }}
        />
        <Footer />
      </>
    );
  }

  // ── Detect /dashboard path for logged-in users ──────────────────────────
if (userId && path === '/dashboard') {
  return (
    <ProjectProvider userId={userId}>
      <Header userId={userId} onLogout={handleLogout} user={user} />
      <ProjectGate userId={userId} user={user}>
        <ProductDashboard user={user} userId={userId} onProductSelect={handleProductSelect} />
      </ProjectGate>
      <Footer />
    </ProjectProvider>
  );
}

// ── Admin Portal ─────────────────────────────────────────────────────
  if (path.startsWith('/admin')) {
    return <AdminPortal />;
  }

  
  // ── Landing page ─────────────────────────────────────────────────────────
  if (!currentProduct) {
    return (
      <>
        <Header userId={userId} onLogout={handleLogout} />
        <LandingPage onProductSelect={handleProductSelect} />
        <Footer />
      </>
    );
  }

  // ── Auth gate for product state set without direct URL ───────────────────
  if (!userId && currentProduct) {
    sessionStorage.setItem('postLoginPath', path);
    window.location.href = '/login';
    return null;
  }

  // ── POMAR Mail ───────────────────────────────────────────────────────────
  if (currentProduct === 'constructmail') {
    return (
      <ProjectProvider userId={userId}>
        <Header userId={userId} onLogout={handleLogout} user={user} />
        <ProjectGate userId={userId} user={user}>
          <ConstructMailApp user={user} userId={userId} onLogout={handleLogout} />
        </ProjectGate>
        <Footer />
      </ProjectProvider>
    );
  }

  // ── POMAR Clash ──────────────────────────────────────────────────────────
  if (currentProduct === 'clash') {
    return (
      <ProjectProvider userId={userId}>
        <Header userId={userId} onLogout={handleLogout} user={user} />
        <ProjectGate userId={userId} user={user}>
          <ClashAnalyzer />
        </ProjectGate>
        <Footer />
      </ProjectProvider>
    );
  }

  // ── POMAR Vendors ────────────────────────────────────────────────────
  if (currentProduct === 'vendors') {
    return (
      <ProjectProvider userId={userId}>
        <Header userId={userId} onLogout={handleLogout} user={user} />
        <ProjectGate userId={userId} user={user}>
          <VendorsApp user={user} userId={userId} onLogout={handleLogout} />
        </ProjectGate>
        <Footer />
      </ProjectProvider>
    );
  }

  // ── POMAR Connect ─────────────────────────────────────────────────────
  if (currentProduct === 'connect' || path === '/connect') {
    return (
      <ProjectProvider userId={userId}>
        <Header userId={userId} onLogout={handleLogout} user={user} />
        <ProjectGate userId={userId} user={user}>
          <ConnectApp userId={userId} />
        </ProjectGate>
        <Footer />
      </ProjectProvider>
    );
  }

if (currentProduct === 'dashboard' || path === '/dashboard') {
    return (
      <ProjectProvider userId={userId}>
        <Header userId={userId} onLogout={handleLogout} user={user} />
        <ProjectGate userId={userId} user={user}>
          <ProductDashboard user={user} userId={userId} onProductSelect={handleProductSelect} />
        </ProjectGate>
        <Footer />
      </ProjectProvider>
    );
  }

  // ── Profile ───────────────────────────────────────────────────────────
  if (currentProduct === 'profile' || path === '/profile') {
    return (
      <ProjectProvider userId={userId}>
        <Header userId={userId} onLogout={handleLogout} user={user} />
        <ProfileApp userId={userId} />
        <Footer />
      </ProjectProvider>
    );
  }

  // ── POMAR Marketplace ──────────────────────────────────────────────────
  if (currentProduct === 'marketplace' || path === '/marketplace') {
    return (
      <ProjectProvider userId={userId}>
        <Header userId={userId} onLogout={handleLogout} user={user} />
        <ProjectGate userId={userId} user={user}>
          <MarketplaceApp user={user} userId={userId} />
        </ProjectGate>
        <Footer />
      </ProjectProvider>
    );
  }

  return <div>Unknown product</div>;
}

export default App;
