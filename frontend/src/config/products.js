export const PRODUCTS = [
  {
    id: 'constructmail',
    name: 'POMAR Mail',
    description: 'AI-powered email intelligence for General Contractors',
    icon: '📧',
    path: '/constructmail',
    logo: '/logos/constructmail.png',
    color: '#D97706',
    status: 'live'
  },
  {
    id: 'clash',
    name: 'POMAR Clash',
    description: 'BIM clash report analyzer — Navisworks to actionable insights',
    icon: '🏗️',
    path: '/clash',
    logo: '/logos/pomar.png',
    color: '#D97706',
    status: 'live'
  },
  {
    id: 'vendors',
    name: 'POMAR Vendors',
    description: 'Find trusted contractors and suppliers in your network',
    icon: '👥',
    path: '/vendors',
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
    description: 'Shared vendor network across the POMAR client base',
    icon: '🛒',
    path: '/marketplace',
    logo: '/logos/pomar.png',
    color: '#D97706',
    status: 'live',
    // Actual availability depends on the user's client_subscriptions
    // .active_modules — the dashboard checks GET /api/marketplace/license
    // and renders a locked card instead of omitting this entry when disabled.
    licenseGated: true
  },
];

export const getProductById = (id) => PRODUCTS.find(p => p.id === id);