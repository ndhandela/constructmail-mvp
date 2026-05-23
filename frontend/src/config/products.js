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
];

export const getProductById = (id) => PRODUCTS.find(p => p.id === id);