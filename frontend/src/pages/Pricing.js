import React from 'react';
import '../styles/Pricing.css';

const PRODUCTS = [
  { name: 'POMAR Mail', tag: 'Live', blurb: 'AI email intelligence — thread summaries, action items, RFI & change order signal detection.' },
  { name: 'POMAR Clash', tag: 'Live', blurb: 'BIM clash analyzer — severity scoring, AI-drafted RFIs, one-click push to Procore.' },
  { name: 'POMAR Vendors', tag: 'Live', blurb: 'Find and manage trusted subcontractors and vendors for your projects.' },
  { name: 'POMAR Marketplace', tag: 'Live', blurb: 'Community vendor directory — share and discover trusted trade partners.' },
];

export default function Pricing() {
  return (
    <div className="pricing-container">
      <section className="pricing-hero">
        <video className="page-hero-video" autoPlay muted loop playsInline
          poster="/videos/hero-construction-poster.jpg">
          <source src="/videos/hero-construction.mp4" type="video/mp4" />
        </video>
        <div className="page-hero-overlay"></div>
        <div className="pricing-eyebrow">Pricing</div>
        <h1>Every GC's stack is different.<br /><em>So is your price.</em></h1>
        <p className="pricing-hero-sub">
          No tiers to squint at. Tell us what you're running and how many projects you're on —
          we'll put together a number that fits.
        </p>
        <a href="/demo" className="pricing-cta-btn">Book a Demo</a>
      </section>

      <section className="pricing-section">
        <div className="pricing-content">
          <div className="pricing-section-eyebrow">What's Included</div>
          <h2>Built to work with the PMIS you already have.</h2>
          <p>
            POMAR sits on top of Procore, Kahua, or whatever your projects are mandated to use —
            no rip-and-replace. Pricing scales with the modules and project volume you need.
          </p>
          <div className="pricing-product-grid">
            {PRODUCTS.map((p) => (
              <div className="pricing-product-card" key={p.name}>
                <div className="pricing-product-tag">{p.tag}</div>
                <h3>{p.name}</h3>
                <p>{p.blurb}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="pricing-section alt-bg">
        <div className="pricing-content pricing-cta-section">
          <h2>Talk to us about your projects.</h2>
          <p>
            Book a 20-minute walkthrough and we'll scope out pricing based on your modules,
            project count, and team size — no obligation.
          </p>
          <a href="/demo" className="pricing-cta-btn">Book a Demo</a>
        </div>
      </section>
    </div>
  );
}
