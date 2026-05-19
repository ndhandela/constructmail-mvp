export const PRODUCTS = [
  {
    id: 'constructmail',
    name: 'ConstructMail',
    description: 'AI-powered email intelligence for General Contractors',
    icon: '📧',
    path: '/constructmail',
    logo: '/logos/constructmail.png',
    color: '#ff6600',
    status: 'live'
  },
  // Future products - just add here!
  // {
  //   id: 'pomar-analytics',
  //   name: 'POMAR Analytics',
  //   description: 'Project analytics and reporting',
  //   icon: '📊',
  //   path: '/analytics',
  //   status: 'coming-soon'
  // }
];

export const getProductById = (id) => PRODUCTS.find(p => p.id === id);