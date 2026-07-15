import React from 'react';
import { getProductById } from '../../config/products';
import '../../styles/LandingPage.css';
import '../../styles/MarketingPage.css';

// Placeholder draft — refine after review.
const HOW_IT_WORKS = [
  'Browse a searchable directory of vetted subs and suppliers in your network.',
  'See prior relationships and ratings before you reach out.',
  'Find the right contact for a trade in seconds, not hours of digging.',
  'Keep your vendor list current as new relationships form.',
];

export default function VendorsMarketing() {
  const product = getProductById('vendors');

  return (
    <div className="marketing-page">
      <section className="hero marketing-hero">
        <div className="hero-eyebrow">Vendor Intelligence</div>
        <h1 className="hero-title">{product.name}</h1>
        <p className="hero-sub">{product.description}</p>
        <div className="hero-cta">
          <a href="/login" className="btn-primary">Explore POMAR Vendors</a>
        </div>
      </section>

      <section className="marketing-body">
        <div className="section-inner">
          <div className="section-eyebrow">Why POMAR Vendors</div>
          <p className="section-body" style={{ maxWidth: '820px' }}>{product.detailedDescription}</p>

          <div className="section-eyebrow">How It Works</div>
          <ul className="marketing-howitworks">
            {HOW_IT_WORKS.map((step, i) => (
              <li key={i} data-step={i + 1}>{step}</li>
            ))}
          </ul>
        </div>
      </section>

      <section className="marketing-cta-section">
        <h2 className="section-h2 centered">Stop starting from scratch every bid.</h2>
        <div className="hero-cta">
          <a href="/login" className="btn-primary">Explore POMAR Vendors</a>
        </div>
      </section>
    </div>
  );
}
