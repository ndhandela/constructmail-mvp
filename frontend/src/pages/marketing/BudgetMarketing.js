import React from 'react';
import { getProductById } from '../../config/products';
import '../../styles/LandingPage.css';
import '../../styles/MarketingPage.css';

const HOW_IT_WORKS = [
  'Set your budget by category for the project — labor, materials, subs, equipment, whatever breakdown your team already uses.',
  'Log commitments and actuals as they happen — POs, invoices, change orders — instead of waiting on a monthly spreadsheet reconciliation.',
  'See budget, committed, and actual side by side per category, with the variance computed automatically instead of re-typed.',
  'Track milestones and work-item progress alongside the dollars, so you know where the money went and what it bought.',
];

export default function BudgetMarketing() {
  const product = getProductById('capital');

  return (
    <div className="marketing-page">
      <title>POMAR Budget — Budget-vs-Actual Tracking for GCs</title>
      <meta name="description" content="Live budget-vs-actual tracking per project — budgeted, committed, and actual by category, computed automatically instead of a shared spreadsheet." />
      <link rel="canonical" href="https://pomar.ai/budget-info" />
      <section className="hero marketing-hero">
        <video className="page-hero-video" autoPlay muted loop playsInline
          poster="/videos/hero-capital-poster.jpg">
          <source src="/videos/hero-capital.mp4" type="video/mp4" />
        </video>
        <div className="page-hero-overlay"></div>
        <div className="hero-eyebrow">Budget Intelligence</div>
        <h1 className="hero-title">POMAR Budget</h1>
        <p className="hero-sub">{product.description}</p>
        <div className="hero-cta">
          <a href="/demo" className="btn-primary">Book a Demo</a>
        </div>
      </section>

      <section className="marketing-body">
        <div className="section-inner">
          <div className="section-eyebrow">Why POMAR Budget</div>
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
        <h2 className="section-h2 centered">Ready to see budget vs. actual in real time?</h2>
        <div className="hero-cta">
          <a href="/demo" className="btn-primary">Book a Demo</a>
        </div>
      </section>
    </div>
  );
}
