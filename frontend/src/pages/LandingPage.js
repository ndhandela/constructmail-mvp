import React from 'react';
import { PRODUCTS } from '../config/products';
import '../styles/LandingPage.css';

export default function LandingPage({ onProductSelect }) {
  return (
    <div className="landing-page">
      <header className="landing-header">
        <img src="/logos/pomar.png" alt="POMAR" className="landing-logo" />
        <h1>POMAR Platform</h1>
        <p className="landing-subtitle">Construction Technology Suite</p>
      </header>

      <div className="products-grid">
        {PRODUCTS.map(product => (
          <div 
            key={product.id} 
            className={`product-card ${product.status}`}
            onClick={() => {
            if (product.status === 'active') {
                window.location.href = '/constructmail';
            }
            }}
            style={{
              cursor: product.status === 'active' ? 'pointer' : 'default',
              opacity: product.status === 'active' ? 1 : 0.6
            }}
          >
            <div className="product-icon">{product.icon}</div>
            <h2>{product.name}</h2>
            <p>{product.description}</p>
            {product.status === 'coming-soon' && (
              <span className="coming-soon-badge">Coming Soon</span>
            )}
            {product.status === 'active' && (
              <span className="launch-badge">Launch →</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}