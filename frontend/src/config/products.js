export const PRODUCTS = [
  {
    id: 'constructmail',
    name: 'POMAR Mail',
    description: 'AI-powered email intelligence for General Contractors',
    detailedDescription: "GCs live in their inbox, and critical information gets buried fast. POMAR Mail connects to your existing email and reads every incoming thread in real time. It automatically summarizes long back-and-forth conversations so you don't have to scroll through 40 replies to find the decision that was made. It extracts action items and assigns them so nothing gets lost between the PM, the super, and the sub. Most importantly, it detects RFI and change-order signals hidden inside ordinary email language before they escalate into schedule or cost problems.",
    icon: '📧',
    path: '/mail',
    marketingPath: '/mail-info',
    logo: '/logos/constructmail.png',
    color: '#D97706',
    status: 'live'
  },
  {
    id: 'clash',
    name: 'POMAR Clash',
    description: 'BIM clash report analyzer — Navisworks to actionable insights',
    detailedDescription: 'Clash reports from Navisworks are usually a wall of raw data: hundreds of clashes with no clear starting point. POMAR Clash ingests that report and automatically scores every clash by severity, so your team knows exactly which ones matter today versus which ones can wait. It auto-drafts RFIs directly from the clash data and pushes them straight into Procore with one click — cutting the time between finding a clash and getting the RFI into the system from hours to minutes.',
    icon: '🏗️',
    path: '/clash',
    marketingPath: '/clash-info',
    logo: '/logos/pomar.png',
    color: '#D97706',
    status: 'live'
  },
  {
    id: 'vendors',
    name: 'POMAR Vendors',
    description: 'Find trusted contractors and suppliers in your network',
    detailedDescription: 'Sourcing the right subcontractor or supplier for a bid usually means digging through old emails, texting around, or relying on memory. POMAR Vendors is a searchable directory built specifically for GCs — browse vetted subs and suppliers in your network, see prior relationships and ratings, and find the right contact for a trade fast instead of starting from scratch every time.',
    icon: '👥',
    path: '/vendors',
    marketingPath: '/vendors-info',
    logo: '/logos/pomar.png',
    color: '#D97706',
    status: 'live'
  },
  {
    id: 'connect',
    name: 'POMAR Connect',
    description: 'Unified action queue — push RFIs, clashes & compliance to Procore/Kahua',
    icon: '⚡',
    path: '/connect',
    logo: '/logos/pomar.png',
    color: '#D97706',
    status: 'live'
  },
  {
    id: 'marketplace',
    name: 'POMAR Marketplace',
    description: 'A shared network of vetted contractors and suppliers, built by GCs, for GCs.',
    detailedDescription: "Every GC has a private list of subs and suppliers they trust — but that list is limited to whoever you've personally worked with. POMAR Marketplace extends that idea across the whole POMAR network: GCs can opt in to share vendors from their own directory into a shared marketplace, and in turn browse listings shared by other GCs. Every listing carries real reviews and ratings from GCs who've actually worked with that vendor, so you're not guessing — you're sourcing from a network of contractors other GCs have already vetted. It's opt-in and controlled by you: you choose what to share, and you get the benefit of everyone else's network in return.",
    icon: '🛒',
    path: '/marketplace',
    marketingPath: '/marketplace-info',
    logo: '/logos/pomar.png',
    color: '#D97706',
    status: 'live',
    // Actual availability depends on the user's client_subscriptions
    // .active_modules — the dashboard checks GET /api/marketplace/license
    // and renders a locked card instead of omitting this entry when disabled.
    licenseGated: true
  },
  {
    id: 'trust',
    name: 'POMAR Trust',
    description: 'RERA compliance — QPR drafts and buyer disclosure, automated from site updates',
    detailedDescription: "Indian builders must file Quarterly Progress Reports with their state RERA authority and proactively disclose any change to layout, amenities, or possession timeline. POMAR Trust reads your site engineers' WhatsApp and email updates, drafts the QPR, and flags disclosure-triggering changes before they become a compliance gap — then logs every buyer notice as proof-of-send.",
    icon: '🛡️',
    path: '/trust',
    logo: '/logos/pomar.png',
    color: '#D97706',
    status: 'live',
    // India-only: rendered only when company_region === 'IN' AND active_modules.trust
    // is true (see pages/Dashboard.js) — never shown to a US org regardless of flags.
    regionGated: 'IN',
    licenseGated: true
  },
  {
    id: 'capital',
    name: 'POMAR Capital Tracker',
    description: 'Budget-vs-actual tracking per project — replaces spreadsheets for small GCs.',
    detailedDescription: "Small GCs usually track budgeted, committed, and actual spend in a shared spreadsheet that's always one edit behind. POMAR Capital Tracker replaces it with a live per-project view: budget by category, what's been committed, what's actually been spent, and the variance — computed automatically, not re-typed. Available to any company, not just India-region orgs.",
    icon: '💰',
    path: '/capital',
    marketingPath: '/capital-info',
    logo: '/logos/pomar.png',
    color: '#D97706',
    status: 'live',
    // No regionGated flag — unlike Trust, this is available to any company
    // (US and India), gated only by active_modules.capital.
    licenseGated: true
  },
  {
    id: 'daily_logs',
    name: 'POMAR Daily Logs',
    description: 'Replace the paper logbook — crew, weather, delays, and site photos from your phone.',
    detailedDescription: "Most crews still track daily site activity in a paper logbook or a text thread that never makes it back to the office. POMAR Daily Logs replaces it with a two-minute mobile entry: date, weather, crew count, work performed, delays and their cause, materials, safety notes, and photos — one live per-project record instead of a notebook in the site trailer. Available to any company, not just India-region orgs.",
    icon: '📋',
    path: '/daily-logs',
    marketingPath: '/daily-logs-info',
    logo: '/logos/pomar.png',
    color: '#D97706',
    status: 'live',
    // No regionGated flag — unlike Trust, this is available to any company
    // (US and India), gated only by active_modules.daily_logs.
    licenseGated: true
  },
  {
    id: 'invoice_tracker',
    name: 'POMAR Invoice Tracker',
    description: 'Upload and track vendor invoices against your projects and budget.',
    detailedDescription: "Vendor invoices usually live scattered across email and paper. POMAR Invoice Tracker gives every project a single place to upload invoice PDFs, tag them to a work item or budget line, and track paid vs. pending — with read-only access you can extend to an outside accountant without giving them the rest of POMAR.",
    icon: '🧾',
    path: '/invoices',
    logo: '/logos/pomar.png',
    color: '#D97706',
    status: 'live',
    // No regionGated flag — available to any company, gated only by
    // active_modules.invoice_tracker.
    licenseGated: true
  },
];

export const getProductById = (id) => PRODUCTS.find(p => p.id === id);