import React from 'react';
import { PRODUCTS } from '../config/products';
import '../styles/Dashboard.css';

export default function ProductDashboard({ user, userId, onProductSelect }) {
  const firstName = user?.name?.split(' ')[0] || user?.full_name?.split(' ')[0] || 'there';
  const company   = user?.company || '';
  const role      = user?.role    || '';

  return (
    <div className="pd-container">
      <div className="pd-welcome">
        <div>
          <h1 className="pd-title">Welcome back, {firstName} 👋</h1>
          {(company || role) && (
            <p className="pd-meta">
              {company}{company && role ? ' · ' : ''}{role}
            </p>
          )}
        </div>
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
            <div className="pd-card-icon">{product.icon}</div>
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
        {[
          { name: 'POMAR Specs', desc: 'Submittal intelligence — match submittals to spec sections instantly', icon: '📋' },
          { name: 'POMAR Field', desc: 'Field-to-model sync — RFI answers that flow back to the model', icon: '🏗️' },
          { name: 'POMAR Closeout', desc: 'Handover intelligence — structured owner handover automatically', icon: '📦' },
        ].map(p => (
          <div key={p.name} className="pd-card pd-card-soon">
            <div className="pd-card-icon">{p.icon}</div>
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
