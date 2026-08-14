import React from 'react';
import { getProductById } from '../../config/products';
import '../../styles/LandingPage.css';
import '../../styles/MarketingPage.css';

const HOW_IT_WORKS = [
  'Upload vendor invoice PDFs to a project and tag each one to a work item or budget line.',
  'Track paid vs. pending status per invoice instead of chasing an email thread or a paper stack.',
  'See invoices roll up against the budget line they\'re tagged to, so committed and actual spend stay in sync.',
  'Extend read-only access to an outside accountant without giving them the rest of POMAR.',
];

export default function InvoicesMarketing() {
  const product = getProductById('invoice_tracker');

  return (
    <div className="marketing-page">
      <title>POMAR Invoices — Vendor Invoice Tracking for GCs</title>
      <meta name="description" content="Upload and track vendor invoices against your projects and budget. Tag each one to a work item and extend read-only access to an outside accountant." />
      <link rel="canonical" href="https://pomar.ai/invoices-info" />
      <section className="hero marketing-hero">
        <video className="page-hero-video" autoPlay muted loop playsInline
          poster="/videos/hero-construction-poster.jpg">
          <source src="/videos/hero-construction.mp4" type="video/mp4" />
        </video>
        <div className="page-hero-overlay"></div>
        <div className="hero-eyebrow">Invoice Intelligence</div>
        <h1 className="hero-title">POMAR Invoices</h1>
        <p className="hero-sub">{product.description}</p>
        <div className="hero-cta">
          <a href="/demo" className="btn-primary">Book a Demo</a>
        </div>
      </section>

      <section className="marketing-body">
        <div className="section-inner">
          <div className="section-eyebrow">Why POMAR Invoices</div>
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
        <h2 className="section-h2 centered">Ready to get invoices out of your inbox?</h2>
        <div className="hero-cta">
          <a href="/demo" className="btn-primary">Book a Demo</a>
        </div>
      </section>
    </div>
  );
}
