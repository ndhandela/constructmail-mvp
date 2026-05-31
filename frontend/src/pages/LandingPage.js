import React from 'react';
import PomarLogo from './../components/PomarLogo';
import '../styles/LandingPage.css';

export default function LandingPage({ onProductSelect }) {
  return (
    <div className="landing">

      {/* === HERO === */}
      <section className="hero">
        <div className="hero-eyebrow">Intelligence Infrastructure for Construction</div>
        <h1 className="hero-title">
          Your project knows everything.<br />
          <em>POMAR helps it remember.</em>
        </h1>
        <p className="hero-sub">
          From inbox overload to clash report chaos, POMAR turns scattered project data into
          decisions general contractors can act on — without changing how their teams work.
        </p>
        <div className="hero-cta">
          <button className="btn-primary" onClick={() => onProductSelect && onProductSelect('constructmail')}>
            Try POMAR Mail — Free
          </button>
          <button className="btn-primary" onClick={() => onProductSelect && onProductSelect('clash')}>
            Try POMAR Clash — Free
          </button>
          <button className="btn-primary" onClick={() => onProductSelect && onProductSelect('vendors')}>
            Explore POMAR Vendors
          </button>
          <a href="/contact" className="btn-ghost">Book a Demo</a>
        </div>
      </section>

      {/* === TRUST === */}
      <section className="trust">
        <div className="trust-label">Built with DFW General Contractors</div>
        <div className="trust-logos">
          <div className="trust-placeholder">GC Partner</div>
          <div className="trust-placeholder">DFW Builder</div>
          <div className="trust-placeholder">VDC Team</div>
          <div className="trust-placeholder">Industry Advisor</div>
        </div>
      </section>

      {/* === QUIET TRUTH === */}
      <section className="quiet-truth">
        <div className="section-inner">
          <div className="section-eyebrow">The Quiet Truth</div>
          <h2 className="section-h2">
            A General Contractor's job is no longer building.<br />
            <em>It's processing.</em>
          </h2>
          <p className="section-body">
            200 emails a day. 2,000 clashes per coordination meeting. Submittals scattered across
            three spreadsheets. RFIs that never make it back to the model. Field photos buried in
            text threads. The information exists. It just doesn't live anywhere useful.
          </p>

          <div className="questions-grid">
            <div className="question">
              <div className="question-mark">?</div>
              <div className="question-text">Which 50 clashes actually block work next week?</div>
            </div>
            <div className="question">
              <div className="question-mark">?</div>
              <div className="question-text">Did the answer to RFI-247 ever make it into the model?</div>
            </div>
            <div className="question">
              <div className="question-mark">?</div>
              <div className="question-text">Is this drawing set really the latest revision?</div>
            </div>
            <div className="question">
              <div className="question-mark">?</div>
              <div className="question-text">Why does closeout always take six extra months?</div>
            </div>
          </div>
        </div>
      </section>

      {/* === QUIET ANSWER === */}
      <section className="quiet-answer">
        <div className="section-eyebrow on-dark">The Quiet Answer</div>
        <h2 className="section-h2 on-dark">
          What if your project<br />
          <em>remembered everything?</em>
        </h2>
        <p className="section-body on-dark">
          POMAR is the intelligence layer that sits on top of the tools your team already uses.
          We don't replace your workflow. We make the noise around it disappear.
        </p>
      </section>

      {/* === PRODUCTS === */}
      <section className="products">
        <div className="section-inner">
          <div className="products-header">
            <div className="section-eyebrow">The Product Family</div>
            <h2 className="section-h2">One platform. Built one problem at a time.</h2>
            <p className="section-body centered">
              Start with one tool. Add the next when you're ready. Same login, same brand,
              same intelligence layer.
            </p>
          </div>

          <div className="product-grid">
            <div className="product-card live" onClick={() => onProductSelect && onProductSelect('constructmail')}>
              <span className="product-badge badge-live">Live Now</span>
              <h3>POMAR Mail</h3>
              <div className="product-tagline">Email Intelligence</div>
              <p>AI triage for project email. Summarize threads, extract action items, detect RFI and change order signals — straight from your Gmail or Outlook inbox.</p>
              <span className="product-link">Try it free →</span>
            </div>

            <div className="product-card live" onClick={() => onProductSelect && onProductSelect('clash')}>
              <span className="product-badge badge-live">Live Now</span>
              <h3>POMAR Clash</h3>
              <div className="product-tagline">BIM Clash Intelligence</div>
              <p>Upload a Navisworks clash report. Get severity scoring, top clashing element pairs, and AI-drafted RFIs ready to paste into Procore or Kahua — in seconds.</p>
              <span className="product-link">Try it free →</span>
            </div>

            <div className="product-card live" onClick={() => onProductSelect && onProductSelect('vendors')}>
              <span className="product-badge badge-live">Live Now</span>
              <h3>POMAR Vendors</h3>
              <div className="product-tagline">Vendor Intelligence</div>
              <p>Find, vet, and track trusted subcontractors and suppliers. Insurance verification, star ratings across 5 trade categories, and one-click CSV or PDF export.</p>
              <span className="product-link">Explore →</span>
            </div>

            <div className="product-card soon">
              <span className="product-badge badge-soon">On the Roadmap</span>
              <h3>POMAR Specs</h3>
              <div className="product-tagline">Submittal Intelligence</div>
              <p>Match every submittal back to the spec section it answers — and flag what's missing — in seconds, not days.</p>
              <span className="product-link disabled">Notify me →</span>
            </div>

            <div className="product-card soon">
              <span className="product-badge badge-soon">On the Roadmap</span>
              <h3>POMAR Field</h3>
              <div className="product-tagline">Field-to-Model Sync</div>
              <p>RFI answers that flow back to the model. Field photos linked to drawing locations. Decisions captured where they happen.</p>
              <span className="product-link disabled">Notify me →</span>
            </div>

            <div className="product-card soon">
              <span className="product-badge badge-soon">On the Roadmap</span>
              <h3>POMAR Closeout</h3>
              <div className="product-tagline">Handover Intelligence</div>
              <p>Turn 18 months of project chaos into a structured owner handover package — automatically.</p>
              <span className="product-link disabled">Notify me →</span>
            </div>

            <div className="product-card soon">
              <span className="product-badge badge-soon">Future</span>
              <h3>POMAR Flow</h3>
              <div className="product-tagline">Cross-Module Automations</div>
              <p>Trigger workflows across every POMAR module. Build rules without code. The intelligence layer becomes your operating system.</p>
              <span className="product-link disabled">Notify me →</span>
            </div>
          </div>
        </div>
      </section>

      {/* === BUILT FOR === */}
      <section className="built-for">
        <h2 className="section-h2 centered">Built for the people who build America.</h2>
        <div className="audience-grid">
          <div className="audience">
            <div className="audience-mark">
              <PomarLogo markOnly height={36} />
            </div>
            <h4>General Contractors</h4>
          </div>
          <div className="audience">
            <div className="audience-mark">
              <PomarLogo markOnly height={36} />
            </div>
            <h4>VDC & BIM Coordinators</h4>
          </div>
          <div className="audience">
            <div className="audience-mark">
              <PomarLogo markOnly height={36} />
            </div>
            <h4>Project Executives</h4>
          </div>
          <div className="audience">
            <div className="audience-mark">
              <PomarLogo markOnly height={36} />
            </div>
            <h4>Owner's Reps</h4>
          </div>
        </div>
      </section>

      {/* === FINAL CTA === */}
      <section className="final-cta">
        <h2 className="section-h2 centered">
          Start with one tool.<br />
          <em>Build the layer over time.</em>
        </h2>
        <p className="section-body centered">
          Both tools are free. No credit card, no commitment. Pick the one that solves
          your biggest problem today.
        </p>
        <div className="hero-cta">
          <button className="btn-primary" onClick={() => onProductSelect && onProductSelect('constructmail')}>
            Try POMAR Mail — Free
          </button>
          <button className="btn-primary" onClick={() => onProductSelect && onProductSelect('clash')}>
            Try POMAR Clash — Free
          </button>
          <a href="/contact" className="btn-ghost">Talk to the Founder</a>
        </div>
      </section>

    </div>
  );
}
