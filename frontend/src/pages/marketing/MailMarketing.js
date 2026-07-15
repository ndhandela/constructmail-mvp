import React from 'react';
import { getProductById } from '../../config/products';
import '../../styles/LandingPage.css';
import '../../styles/MarketingPage.css';

const HOW_IT_WORKS = [
  'Connect your existing Gmail or Outlook inbox — no workflow change required.',
  "POMAR Mail reads every incoming thread in real time and summarizes long back-and-forths into the decision that was actually made.",
  'Action items are extracted and assigned automatically across the PM, the super, and the sub.',
  'RFI and change-order signals hidden in ordinary email language are flagged before they escalate into schedule or cost problems.',
];

export default function MailMarketing() {
  const product = getProductById('constructmail');

  return (
    <div className="marketing-page">
      <section className="hero marketing-hero">
        <div className="hero-eyebrow">Email Intelligence</div>
        <h1 className="hero-title">{product.name}</h1>
        <p className="hero-sub">{product.description}</p>
        <div className="hero-cta">
          <a href="/login" className="btn-primary">Try POMAR Mail — Free</a>
        </div>
      </section>

      <section className="marketing-body">
        <div className="section-inner">
          <div className="section-eyebrow">Why POMAR Mail</div>
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
        <h2 className="section-h2 centered">Ready to stop scrolling through 40 replies?</h2>
        <div className="hero-cta">
          <a href="/login" className="btn-primary">Try POMAR Mail — Free</a>
        </div>
      </section>
    </div>
  );
}
