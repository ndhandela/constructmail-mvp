import React from 'react';
import { getProductById } from '../../config/products';
import '../../styles/LandingPage.css';
import '../../styles/MarketingPage.css';

// Placeholder draft — refine after review.
const HOW_IT_WORKS = [
  'Upload your Navisworks clash report.',
  'Every clash is automatically scored by severity, so your team knows what matters today.',
  'RFIs are auto-drafted directly from the clash data.',
  'Push RFIs straight into Procore with one click.',
];

export default function ClashMarketing() {
  const product = getProductById('clash');

  return (
    <div className="marketing-page">
      <section className="hero marketing-hero">
        <video className="page-hero-video" autoPlay muted loop playsInline
          poster="/videos/hero-construction-poster.jpg">
          <source src="/videos/hero-construction.mp4" type="video/mp4" />
        </video>
        <div className="page-hero-overlay"></div>
        <div className="hero-eyebrow">BIM Clash Intelligence</div>
        <h1 className="hero-title">{product.name}</h1>
        <p className="hero-sub">{product.description}</p>
        <div className="hero-cta">
          <a href="/login" className="btn-primary">Try POMAR Clash — Free</a>
        </div>
      </section>

      <section className="marketing-body">
        <div className="section-inner">
          <div className="section-eyebrow">Why POMAR Clash</div>
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
        <h2 className="section-h2 centered">Turn a wall of clashes into a starting point.</h2>
        <div className="hero-cta">
          <a href="/login" className="btn-primary">Try POMAR Clash — Free</a>
        </div>
      </section>
    </div>
  );
}
