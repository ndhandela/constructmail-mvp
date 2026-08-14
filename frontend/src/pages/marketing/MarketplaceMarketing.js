import React from 'react';
import { getProductById } from '../../config/products';
import '../../styles/LandingPage.css';
import '../../styles/MarketingPage.css';

// Placeholder draft — refine after review.
const HOW_IT_WORKS = [
  'Opt in to share vendors from your own directory into the shared marketplace.',
  'Browse listings shared by other GCs across the POMAR network.',
  "See real reviews and ratings from GCs who've actually worked with each vendor.",
  "Control exactly what you share — it's opt-in, not automatic.",
];

export default function MarketplaceMarketing() {
  const product = getProductById('marketplace');

  return (
    <div className="marketing-page">
      <title>POMAR Marketplace — Shared Vendor Network for GCs</title>
      <meta name="description" content="Browse vendor listings shared by other General Contractors, backed by real reviews — and opt in to share vendors from your own directory in return." />
      <link rel="canonical" href="https://pomar.ai/marketplace-info" />
      <section className="hero marketing-hero">
        <video className="page-hero-video" autoPlay muted loop playsInline
          poster="/videos/hero-marketplace-poster.jpg">
          <source src="/videos/hero-marketplace.mp4" type="video/mp4" />
        </video>
        <div className="page-hero-overlay"></div>
        <div className="hero-eyebrow">Vendor Network Intelligence</div>
        <h1 className="hero-title">{product.name}</h1>
        <p className="hero-sub">{product.description}</p>
        <div className="hero-cta">
          <a href="/marketplace/listings" className="btn-primary">Explore POMAR Marketplace</a>
        </div>
      </section>

      <section className="marketing-body">
        <div className="section-inner">
          <div className="section-eyebrow">Why POMAR Marketplace</div>
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
        <h2 className="section-h2 centered">Your network, multiplied by every GC on POMAR.</h2>
        <div className="hero-cta">
          <a href="/marketplace/listings" className="btn-primary">Explore POMAR Marketplace</a>
        </div>
      </section>
    </div>
  );
}
