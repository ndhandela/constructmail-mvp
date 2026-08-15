import React, { useState, useEffect } from 'react';
import { ProjectProvider } from './contexts/ProjectContext';
import { UnsavedChangesProvider } from './contexts/UnsavedChangesContext';
import { InstallPromptProvider } from './contexts/InstallPromptContext';
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
import BudgetMarketing from './pages/marketing/BudgetMarketing';
import InvoicesMarketing from './pages/marketing/InvoicesMarketing';
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
import WorkItemsApp from './modules/capital/pages/WorkItemsApp';
import DailyLogsApp from './modules/daily-logs/pages/DailyLogsApp';
import InvoiceTrackerApp from './modules/invoices/pages/InvoiceTrackerApp';
import AccountantInvoiceView from './modules/invoices/pages/AccountantInvoiceView';
import DocumentsApp from './modules/documents/pages/DocumentsApp';
import PermitTrackerApp from './modules/permits/pages/PermitTrackerApp';
import TaskTrackerApp from './modules/tasks/pages/TaskTrackerApp';
import ProjectsOverviewPage from './modules/project-hub/pages/ProjectsOverviewPage';
import ProjectDetailPage from './modules/project-hub/pages/ProjectDetailPage';

// Modules
import ConstructMailApp from './modules/constructmail/pages/ConstructMailApp';
import ClashAnalyzer from './modules/clash/pages/ClashAnalyzer';
import ProductDashboard from './pages/Dashboard';
import ProjectsEditPage from './pages/ProjectsEditPage';

import './styles/theme.css';
import './styles/components.css';
import './App.css';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';
const PRODUCT_PATHS = ['/clash', '/mail', '/dashboard', '/vendors', '/connect', '/marketplace', '/profile', '/company-settings', '/trust', '/capital', '/daily-logs', '/invoices', '/documents', '/permits', '/tasks', '/work-items', '/projects-overview', '/project'];

// Every public route that renders its own <title>/<meta description>/
// <link rel="canonical"> (see each page component). React 19 hoists
// title/meta/link tags rendered anywhere in the tree straight to <head>,
// but it does NOT dedupe two of them rendered at the same time from
// different parts of the tree — so the site-wide default title below is
// only rendered when the current path *isn't* one of these, to guarantee
// exactly one <title>/<meta description> is ever active at once.
const PUBLIC_SEO_PATHS = ['/', '/pricing', '/about', '/contact', '/demo', '/mail-info', '/clash-info', '/vendors-info', '/marketplace-info', '/daily-logs-info', '/budget-info', '/invoices-info', '/marketplace/listings', '/marketplace/terms', '/marketplace/dispute-policy', '/privacy'];

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

    if (path === '/accept-invite') {
      // AcceptInvite.js owns its own `?token=` entirely (a one-time invite
      // token validated via POST /api/auth/accept-invite) and handles its
      // own login after password-set. Without this early return, the
      // verify-token logic below saw the same `token` param, mistook it for
      // a magic-link session token, and fired POST /api/auth/verify-token
      // in the background — which always 400s against an invite token, and
      // surfaced as a stray "Login failed: undefined" alert plus the whole
      // page stuck behind `loading` (see the `if (loading)` gate below)
      // until that failing request resolved.
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
          else if (path === '/documents') setCurrentProduct('documents');
          else if (path === '/permits') setCurrentProduct('permits');
          else if (path === '/tasks') setCurrentProduct('tasks');
          else if (path === '/work-items') setCurrentProduct('work-items');
          else if (path === '/projects-overview') setCurrentProduct('projects-overview');
          else if (path === '/project') setCurrentProduct('project');
          else setCurrentProduct('dashboard');
          window.history.replaceState({}, document.title, window.location.pathname);
        } else {
          // FastAPI error bodies are {"detail": ...}, not {"error": ...} —
          // reading .error here always produced a literal "undefined".
          alert('Login failed: ' + (data.detail || data.error || 'Please try signing in again.'));
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
      if (path === '/documents') setCurrentProduct('documents');
      if (path === '/permits') setCurrentProduct('permits');
      if (path === '/tasks') setCurrentProduct('tasks');
      if (path === '/work-items') setCurrentProduct('work-items');
      if (path === '/projects-overview') setCurrentProduct('projects-overview');
      if (path === '/project') setCurrentProduct('project');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const fetchUser = async (uid) => {
    // A fresh page load (hard refresh, or any full navigation on a
    // PRODUCT_PATH) hits this before anything else renders, and the
    // `if (loading)` gate below blocks every route — including /login —
    // until it settles. Without a timeout, a hung request left the whole
    // app stuck on "Loading..." forever with no way out. And an
    // unsuccessful response (e.g. a stale/deleted userId still sitting in
    // localStorage — {"detail": "User not found"}) used to get stored as
    // `user` as-is: a malformed object with no `role`/`account_status`,
    // which downstream checks (like the SelectRole gate) treated as a
    // real, if incomplete, logged-in user instead of "not logged in."
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/me?userId=${uid}`, { signal: controller.signal });
      if (!response.ok) throw new Error(`GET /api/auth/me failed: ${response.status}`);
      const data = await response.json();
      setUser(data);
      setLoading(false);
    } catch (err) {
      console.error('Fetch user error:', err);
      // Can't verify this session — fail safe rather than leaving a
      // half-restored userId-but-no-user state or an infinite spinner.
      // The normal logged-out routing (below) sends the user to /login.
      localStorage.removeItem('constructmail_userId');
      localStorage.removeItem('marketplace_sessionToken');
      setUserId(null);
      setUser(null);
      setLoading(false);
    } finally {
      clearTimeout(timeoutId);
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

  if (path === '/budget-info') {
    return (
      <>
        <Header userId={userId} onLogout={handleLogout} user={user} />
        <BudgetMarketing />
        <Footer />
      </>
    );
  }

  if (path === '/invoices-info') {
    return (
      <>
        <Header userId={userId} onLogout={handleLogout} user={user} />
        <InvoicesMarketing />
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
    return <AccountantInvoiceView user={user} userId={userId} onLogout={handleLogout} onUserRefresh={() => fetchUser(userId)} />;
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
  // Phase 3 cutover: for accounts on the new nav, the project-tracking
  // Dashboard (/projects-overview) replaces this "Your Tools" product grid
  // as the post-login landing page. Gated the same way as everything else
  // in this rollout — an unflagged account's /dashboard (including the
  // ?view=projects-edit sub-view, deliberately excluded here) is completely
  // untouched, so this is a safe rollback point, not a deletion.
  if (user?.new_nav_enabled && new URLSearchParams(window.location.search).get('view') !== 'projects-edit') {
    window.location.href = '/projects-overview';
    return null;
  }
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

  // ── POMAR Documents ──────────────────────────────────────────────────
  // Same wiring as Capital Tracker/Daily Logs/Invoice Tracker — documents
  // hang off the generic projects table, so it uses the shared
  // header/sidebar project switcher and ProjectGate, gated only by the
  // 'documents' feature flag.
  if (currentProduct === 'documents' || path === '/documents') {
    return (
      <ProjectProvider userId={userId}>
        <AppLayout userId={userId} onLogout={handleLogout} user={user}>
          <ProjectGate userId={userId} user={user}>
            <DocumentsApp user={user} userId={userId} />
          </ProjectGate>
        </AppLayout>
      </ProjectProvider>
    );
  }

  // ── POMAR Permit Tracker ─────────────────────────────────────────────
  // Same wiring as Capital Tracker/Daily Logs/Invoice Tracker/Documents —
  // permits hang off the generic projects table, so it uses the shared
  // header/sidebar project switcher and ProjectGate, gated only by the
  // 'permits' feature flag.
  if (currentProduct === 'permits' || path === '/permits') {
    return (
      <ProjectProvider userId={userId}>
        <AppLayout userId={userId} onLogout={handleLogout} user={user}>
          <ProjectGate userId={userId} user={user}>
            <PermitTrackerApp user={user} userId={userId} />
          </ProjectGate>
        </AppLayout>
      </ProjectProvider>
    );
  }

  // ── POMAR Task Tracker ───────────────────────────────────────────────
  // Same wiring as Capital Tracker/Daily Logs/Invoice Tracker/Documents/
  // Permits — tasks hang off the generic projects table, so it uses the
  // shared header/sidebar project switcher and ProjectGate, gated only by
  // the 'tasks' feature flag.
  if (currentProduct === 'tasks' || path === '/tasks') {
    return (
      <ProjectProvider userId={userId}>
        <AppLayout userId={userId} onLogout={handleLogout} user={user}>
          <ProjectGate userId={userId} user={user}>
            <TaskTrackerApp user={user} userId={userId} />
          </ProjectGate>
        </AppLayout>
      </ProjectProvider>
    );
  }

  // ── POMAR Work Items ─────────────────────────────────────────────────
  // Same wiring as Capital Tracker/Daily Logs/Invoice Tracker/Documents/
  // Permits — work_items hangs off the generic projects table, so it uses
  // the shared header/sidebar project switcher and ProjectGate. Gated by
  // the existing 'capital' feature flag (work_items is Capital Tracker's
  // root entity, not a separately licensed module — see
  // modules/capital/pages/WorkItemsApp.js).
  if (currentProduct === 'work-items' || path === '/work-items') {
    return (
      <ProjectProvider userId={userId}>
        <AppLayout userId={userId} onLogout={handleLogout} user={user}>
          <ProjectGate userId={userId} user={user}>
            <WorkItemsApp user={user} userId={userId} />
          </ProjectGate>
        </AppLayout>
      </ProjectProvider>
    );
  }

  // ── Project Hub: Dashboard + Project Detail ──────────────────────────
  // Phase 1 of the nav/project-tracking redesign — reachable by direct URL
  // only, not yet linked from Sidebar/BottomNav. Same wiring as the other
  // generic-projects-table modules (shared header/sidebar project switcher,
  // gated by ProjectGate). No feature flag yet since these aren't in nav.
  if (currentProduct === 'projects-overview' || path === '/projects-overview') {
    return (
      <ProjectProvider userId={userId}>
        <AppLayout userId={userId} onLogout={handleLogout} user={user}>
          <ProjectGate userId={userId} user={user}>
            <ProjectsOverviewPage user={user} userId={userId} />
          </ProjectGate>
        </AppLayout>
      </ProjectProvider>
    );
  }

  if (currentProduct === 'project' || path === '/project') {
    return (
      <ProjectProvider userId={userId}>
        <AppLayout userId={userId} onLogout={handleLogout} user={user}>
          <ProjectGate userId={userId} user={user}>
            <ProjectDetailPage user={user} userId={userId} />
          </ProjectGate>
        </AppLayout>
      </ProjectProvider>
    );
  }

  return <div>Unknown product</div>;
}

export default function AppWithProviders() {
  const path = window.location.pathname;
  // Site-wide fallback title/description for every route that doesn't
  // render its own (see PUBLIC_SEO_PATHS above) — e.g. /login, /dashboard,
  // /mail. Skipped on public SEO routes so exactly one <title>/<meta
  // description> is ever rendered per page; React 19 hoists title/meta/link
  // tags from anywhere in the tree to <head>, but doesn't dedupe two of them
  // rendered at once.
  const showDefaultSEO = !PUBLIC_SEO_PATHS.includes(path);
  return (
    <InstallPromptProvider>
      <UnsavedChangesProvider>
        {showDefaultSEO && (
          <>
            <title>POMAR — Intelligence Infrastructure for General Contractors</title>
            <meta name="description" content="POMAR — intelligence infrastructure for General Contractors, covering email, BIM clash, vendors, budget, daily logs, and more." />
          </>
        )}
        <App />
      </UnsavedChangesProvider>
    </InstallPromptProvider>
  );
}
