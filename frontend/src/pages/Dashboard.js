import React from 'react';
import { PRODUCTS } from '../config/products';
import '../styles/Dashboard.css';

// Clean SVG icons for each product
const PRODUCT_ICONS = {
  constructmail: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="20" height="16" rx="2"/>
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
    </svg>
  ),
  clash: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 20h20"/>
      <path d="M5 20V8l7-6 7 6v12"/>
      <path d="M9 20v-6h6v6"/>
      <path d="M9 14h6"/>
    </svg>
  ),
};

const SOON_ICONS = {
  'POMAR Specs': (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="16" y1="13" x2="8" y2="13"/>
      <line x1="16" y1="17" x2="8" y2="17"/>
    </svg>
  ),
  'POMAR Field': (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
      <circle cx="12" cy="10" r="3"/>
    </svg>
  ),
  'POMAR Closeout': (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  ),
};

const SOON_PRODUCTS = [
  { name: 'POMAR Specs',     desc: 'Submittal intelligence — match submittals to spec sections instantly' },
  { name: 'POMAR Field',     desc: 'Field-to-model sync — RFI answers that flow back to the model' },
  { name: 'POMAR Closeout',  desc: 'Handover intelligence — structured owner handover automatically' },
];

export default function ProductDashboard({ user, userId, onProductSelect }) {
  const firstName = user?.full_name?.split(' ')[0]
    || user?.name?.split(' ')[0]
    || user?.email?.split('@')[0]
    || 'there';
  const company = user?.company || '';
  const role    = user?.role    || '';

  return (
    <div className="pd-container">
      <div className="pd-welcome">
        <h1 className="pd-title">Welcome back, {firstName} 👋</h1>
        {(company || role) && (
          <p className="pd-meta">
            {company}{company && role ? ' · ' : ''}{role}
          </p>
        )}
      </div>

      <div className="pd-section-label">Your tools</div>
      <div className="pd-grid">
        {PRODUCTS.filter(p => p.status === 'live').map(product => (
          <div
            key={product.id}
            className="pd-card"
            onClick={() => onProductSelect(product.id)}
            style={{ '--product-color': product.color }}
          >
            <div className="pd-card-icon" style={{ color: product.color }}>
              {PRODUCT_ICONS[product.id]}
            </div>
            <div className="pd-card-body">
              <h3 className="pd-card-title">{product.name}</h3>
              <p className="pd-card-desc">{product.description}</p>
            </div>
            <div className="pd-card-arrow">→</div>
          </div>
        ))}
      </div>

      <div className="pd-section-label" style={{ marginTop: 40 }}>Coming soon</div>
      <div className="pd-grid">
        {SOON_PRODUCTS.map(p => (
          <div key={p.name} className="pd-card pd-card-soon">
            <div className="pd-card-icon" style={{ color: 'var(--slate)' }}>
              {SOON_ICONS[p.name]}
            </div>
            <div className="pd-card-body">
              <h3 className="pd-card-title">{p.name}</h3>
              <p className="pd-card-desc">{p.desc}</p>
            </div>
            <div className="pd-card-badge">Soon</div>
          </div>
        ))}
      </div>
    </div>
  );
}
