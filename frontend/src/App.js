import React, { useState, useEffect } from 'react';
import { ProjectProvider } from './contexts/ProjectContext';
import { UnsavedChangesProvider } from './contexts/UnsavedChangesContext';
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
import DailyLogsMarketing from './pages/marketing/DailyLogsMarketing';
import CapitalMarketing from './pages/marketing/CapitalMarketing';
import MarketplacePublicBrowse from './pages/marketing/MarketplacePublicBrowse';
import MarketplaceListingDetail from './pages/marketing/MarketplaceListingDetail';
import MarketplaceTerms from './pages/marketing/MarketplaceTerms';
import MarketplaceDisputePolicy from './pages/marketing/MarketplaceDisputePolicy';
import Header from './components/Header';
import Footer from './components/Footer';
import AppLayout from './components/AppLayout';
import ProjectGate from './components/ProjectGate';
import AboutUs from './pages/AboutUs';
import ResetPassword from './pages/ResetPassword';
import AcceptInvite from './pages/AcceptInvite';
import AdminPortal from './admin/pages/AdminPortal';
import VendorsApp from './modules/vendors/pages/VendorsApp';
import ConnectApp from './modules/connect/pages/ConnectApp';
import MarketplaceApp from './modules/marketplace/pages/MarketplaceApp';
import ProfileApp from './modules/profile/pages/ProfileApp';
import CompanySettingsApp from './modules/profile/pages/CompanySettingsApp';
import TrustApp from './modules/trust/pages/TrustApp';
import CapitalTrackerApp from './modules/capital/pages/CapitalTrackerApp';
import DailyLogsApp from './modules/daily-logs/pages/DailyLogsApp';
import InvoiceTrackerApp from './modules/invoices/pages/InvoiceTrackerApp';
import AccountantInvoiceView from './modules/invoices/pages/AccountantInvoiceView';

// Modules
import ConstructMailApp from './modules/constructmail/pages/ConstructMailApp';
import ClashAnalyzer from './modules/clash/pages/ClashAnalyzer';
import ProductDashboard from './pages/Dashboard';
import ProjectsEditPage from './pages/ProjectsEditPage';

import './styles/theme.css';
import './styles/components.css';
import './App.css';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';
const PRODUCT_PATHS = ['/clash', '/mail', '/dashboard', '/vendors', '/connect', '/marketplace', '/profile', '/company-settings', '/trust', '/capital', '/daily-logs', '/invoices'];

// The "Your Tools" landing grid and the Projects edit page share the
// /dashboard route — the edit page is reached only via the project info
// slide-over's "Edit Project Info"/"Edit Team Members" buttons (see
// ProjectInfoSlideOver.js), which navigate to
// /dashboard?view=projects-edit&section=info|team&projectId=... via a full
// page load (this app has no client router). Parsing that here keeps the
// decision local to the one route both views live on.
function DashboardArea({ user, userId, onProductSelect }) {
  const params = new URLSearchParams(window.location.search);
  const view = params.get('view');

  if (view === 'projects-edit') {
    return (
      <ProjectsEditPage
        projectId={params.get('projectId')}
        section={params.get('section') || 'info'}
        userId={userId}
        user={user}
        onBack={() => { window.location.href = '/dashboard'; }}
      />
    );
  }

  return <ProductDashboard user={user} userId={userId} onProductSelect={onProductSelect} />;
}

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
          if (data.sessionToken) {
            // Bearer token for the marketplace GET .../full and POST
            // .../dispute routes only — every other request in this app
            // still authenticates via the plain userId param above.
            localStorage.setItem('marketplace_sessionToken', data.sessionToken);
          }
          fetchUser(data.userId);
          // Mirrors the [userId] effect below — every product path needs its
          // own case here too, otherwise a magic-link login on (e.g.) /trust
          // briefly renders the generic Dashboard/ProjectGate (and its
          // "New Project" modal) before the other effect corrects it, since
          // this branch used to default anything but /clash and /connect to
          // 'dashboard'.
          if (path === '/mail') setCurrentProduct('constructmail');
          else if (path === '/clash') setCurrentProduct('clash');
          else if (path === '/vendors') setCurrentProduct('vendors');
          else if (path === '/connect') setCurrentProduct('connect');
          else if (path === '/marketplace') setCurrentProduct('marketplace');
          else if (path === '/profile') setCurrentProduct('profile');
          else if (path === '/company-settings') setCurrentProduct('company-settings');
          else if (path === '/trust') setCurrentProduct('trust');
          else if (path === '/capital') setCurrentProduct('capital');
          else if (path === '/daily-logs') setCurrentProduct('daily-logs');
          else if (path === '/invoices') setCurrentProduct('invoices');
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
      if (path === '/company-settings') setCurrentProduct('company-settings');
      if (path === '/trust') setCurrentProduct('trust');
      if (path === '/capital') setCurrentProduct('capital');
      if (path === '/daily-logs') setCurrentProduct('daily-logs');
      if (path === '/invoices') setCurrentProduct('invoices');
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
    localStorage.removeItem('marketplace_sessionToken');
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

  if (path === '/daily-logs-info') {
    return (
      <>
        <Header userId={userId} onLogout={handleLogout} user={user} />
        <DailyLogsMarketing />
        <Footer />
      </>
    );
  }

  if (path === '/capital-info') {
    return (
      <>
        <Header userId={userId} onLogout={handleLogout} user={user} />
        <CapitalMarketing />
        <Footer />
      </>
    );
  }

  // ── Public Marketplace routes (no auth — browse/detail/legal) ────────────
  if (path === '/marketplace/listings') {
    return (
      <>
        <Header userId={userId} onLogout={handleLogout} user={user} />
        <MarketplacePublicBrowse />
        <Footer />
      </>
    );
  }

  if (path.startsWith('/marketplace/listings/')) {
    const listingId = path.slice('/marketplace/listings/'.length).split('/')[0];
    return (
      <>
        <Header userId={userId} onLogout={handleLogout} user={user} />
        <MarketplaceListingDetail listingId={listingId} userId={userId} />
        <Footer />
      </>
    );
  }

  if (path === '/marketplace/terms') {
    return (
      <>
        <Header userId={userId} onLogout={handleLogout} user={user} />
        <MarketplaceTerms />
        <Footer />
      </>
    );
  }

  if (path === '/marketplace/dispute-policy') {
    return (
      <>
        <Header userId={userId} onLogout={handleLogout} user={user} />
        <MarketplaceDisputePolicy />
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

  // ── Invoice Tracker external accountant — standalone, no chrome ─────────
  // Deliberately outside PRODUCT_PATHS/currentProduct entirely: no
  // AppLayout/Header/Sidebar, no SelectRole gate (an accountant account
  // never has a role and never should), no ProjectProvider — this account
  // type only ever sees this one screen. See
  // modules/invoices/pages/AccountantInvoiceView.js.
  if (path === '/accountant') {
    if (!userId) {
      sessionStorage.setItem('postLoginPath', path);
      window.location.href = '/login';
      return null;
    }
    return <AccountantInvoiceView user={user} userId={userId} onLogout={handleLogout} />;
  }

  // ── Accountant accounts never reach anywhere but /accountant ────────────
  // An accountant has no role, no company_id, and no project_members rows —
  // letting them fall through to the normal SelectRole/dashboard/product
  // machinery below would show a confusing half-broken shell instead of a
  // clean block (and, worse, a module page whose "locked" check treats an
  // empty active_modules as *unlocked* for a no-company account). Redirect
  // unconditionally to the one route this account type is allowed to see.
  if (userId && user?.account_type === 'accountant' && path !== '/accountant') {
    window.location.href = '/accountant';
    return null;
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
      <AppLayout userId={userId} onLogout={handleLogout} user={user}>
        <ProjectGate userId={userId} user={user}>
          <DashboardArea user={user} userId={userId} onProductSelect={handleProductSelect} />
        </ProjectGate>
      </AppLayout>
    </ProjectProvider>
  );
}

// ── Admin Portal ─────────────────────────────────────────────────────
  if (path.startsWith('/admin')) {
    return <AdminPortal />;
  }

  // ── Logged-in users hitting the marketing root go to the dashboard ──────
  // Without this, a logged-in userId (from localStorage) falls through to
  // the "Landing page" branch below: Header renders in logged-in mode
  // (avatar, "Select a project") but the body is still the public
  // marketing LandingPage, producing a mismatched half-logged-in UI.
  if (userId && path === '/') {
    window.location.href = '/dashboard';
    return null;
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
        <AppLayout userId={userId} onLogout={handleLogout} user={user}>
          <ProjectGate userId={userId} user={user}>
            <ConstructMailApp user={user} userId={userId} onLogout={handleLogout} />
          </ProjectGate>
        </AppLayout>
      </ProjectProvider>
    );
  }

  // ── POMAR Clash ──────────────────────────────────────────────────────────
  if (currentProduct === 'clash') {
    return (
      <ProjectProvider userId={userId}>
        <AppLayout userId={userId} onLogout={handleLogout} user={user}>
          <ProjectGate userId={userId} user={user}>
            <ClashAnalyzer user={user} />
          </ProjectGate>
        </AppLayout>
      </ProjectProvider>
    );
  }

  // ── POMAR Vendors ────────────────────────────────────────────────────
  if (currentProduct === 'vendors') {
    return (
      <ProjectProvider userId={userId}>
        <AppLayout userId={userId} onLogout={handleLogout} user={user}>
          <ProjectGate userId={userId} user={user}>
            <VendorsApp user={user} userId={userId} onLogout={handleLogout} />
          </ProjectGate>
        </AppLayout>
      </ProjectProvider>
    );
  }

  // ── POMAR Connect ─────────────────────────────────────────────────────
  if (currentProduct === 'connect' || path === '/connect') {
    return (
      <ProjectProvider userId={userId}>
        <AppLayout userId={userId} onLogout={handleLogout} user={user}>
          <ProjectGate userId={userId} user={user}>
            <ConnectApp userId={userId} />
          </ProjectGate>
        </AppLayout>
      </ProjectProvider>
    );
  }

if (currentProduct === 'dashboard' || path === '/dashboard') {
    return (
      <ProjectProvider userId={userId}>
        <AppLayout userId={userId} onLogout={handleLogout} user={user}>
          <ProjectGate userId={userId} user={user}>
            <DashboardArea user={user} userId={userId} onProductSelect={handleProductSelect} />
          </ProjectGate>
        </AppLayout>
      </ProjectProvider>
    );
  }

  // ── Profile ───────────────────────────────────────────────────────────
  if (currentProduct === 'profile' || path === '/profile') {
    return (
      <ProjectProvider userId={userId}>
        <AppLayout userId={userId} onLogout={handleLogout} user={user}>
          <ProfileApp userId={userId} />
        </AppLayout>
      </ProjectProvider>
    );
  }

  // ── Company Settings ─────────────────────────────────────────────────
  if (currentProduct === 'company-settings' || path === '/company-settings') {
    return (
      <ProjectProvider userId={userId}>
        <AppLayout userId={userId} onLogout={handleLogout} user={user}>
          <CompanySettingsApp userId={userId} />
        </AppLayout>
      </ProjectProvider>
    );
  }

  // ── POMAR Marketplace ──────────────────────────────────────────────────
  if (currentProduct === 'marketplace' || path === '/marketplace') {
    return (
      <ProjectProvider userId={userId}>
        <AppLayout userId={userId} onLogout={handleLogout} user={user}>
          <ProjectGate userId={userId} user={user}>
            <MarketplaceApp user={user} userId={userId} />
          </ProjectGate>
        </AppLayout>
      </ProjectProvider>
    );
  }

  // ── POMAR Trust (India-only) ─────────────────────────────────────────
  // No ProjectGate — Trust has its own project concept (trust_projects,
  // RERA-registered developments), independent of the shared POMAR
  // ProjectContext the other modules use. ProjectProvider is still mounted
  // (without ProjectGate) purely so Sidebar sees the user's real project
  // list — otherwise it falls back to the context's default empty array
  // and disables Mail/Clash/Vendors/Connect until another route mounts one.
  if (currentProduct === 'trust' || path === '/trust') {
    return (
      <ProjectProvider userId={userId}>
        <AppLayout userId={userId} onLogout={handleLogout} user={user}>
          <TrustApp user={user} userId={userId} />
        </AppLayout>
      </ProjectProvider>
    );
  }

  // ── POMAR Capital Tracker ────────────────────────────────────────────
  // Unlike Trust, Capital Tracker's budget_items hangs off the same generic
  // projects table Mail/Clash/Vendors use, so it follows their exact
  // pattern: the shared header/sidebar project switcher (ProjectContext)
  // picks the project, ProjectGate blocks the page until the company has
  // at least one. No region check — available to any company, gated only
  // by the 'capital' feature flag.
  if (currentProduct === 'capital' || path === '/capital') {
    return (
      <ProjectProvider userId={userId}>
        <AppLayout userId={userId} onLogout={handleLogout} user={user}>
          <ProjectGate userId={userId} user={user}>
            <CapitalTrackerApp user={user} userId={userId} />
          </ProjectGate>
        </AppLayout>
      </ProjectProvider>
    );
  }

  // ── POMAR Daily Logs ─────────────────────────────────────────────────
  // Same wiring as Capital Tracker: daily_logs hangs off the generic
  // projects table, so it uses the shared header/sidebar project switcher
  // and ProjectGate, gated only by the 'daily_logs' feature flag.
  if (currentProduct === 'daily-logs' || path === '/daily-logs') {
    return (
      <ProjectProvider userId={userId}>
        <AppLayout userId={userId} onLogout={handleLogout} user={user}>
          <ProjectGate userId={userId} user={user}>
            <DailyLogsApp user={user} userId={userId} />
          </ProjectGate>
        </AppLayout>
      </ProjectProvider>
    );
  }

  // ── POMAR Invoice Tracker ────────────────────────────────────────────
  // Same wiring as Capital Tracker/Daily Logs — invoices hang off the
  // generic projects table, so it uses the shared header/sidebar project
  // switcher and ProjectGate, gated only by the 'invoice_tracker' feature
  // flag. This is the normal in-app teammate view; the external
  // accountant's read-only view is a completely separate route (see
  // /accountant above), not this one.
  if (currentProduct === 'invoices' || path === '/invoices') {
    return (
      <ProjectProvider userId={userId}>
        <AppLayout userId={userId} onLogout={handleLogout} user={user}>
          <ProjectGate userId={userId} user={user}>
            <InvoiceTrackerApp user={user} userId={userId} />
          </ProjectGate>
        </AppLayout>
      </ProjectProvider>
    );
  }

  return <div>Unknown product</div>;
}

export default function AppWithProviders() {
  return (
    <UnsavedChangesProvider>
      <App />
    </UnsavedChangesProvider>
  );
}
