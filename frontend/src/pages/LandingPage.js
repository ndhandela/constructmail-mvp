import React from 'react';
import PomarLogo from './../components/PomarLogo';
import { getProductById } from '../config/products';
import '../styles/LandingPage.css';

const goToMarketing = (id) => {
  window.location.href = getProductById(id).marketingPath;
};

export default function LandingPage({ onProductSelect }) {
  return (
    <div className="landing">
      <title>POMAR — Intelligence Infrastructure for General Contractors</title>
      <meta name="description" content="POMAR turns scattered project data into decisions general contractors can act on. Start with POMAR Mail, free — then add Clash, Vendors, and more when you're ready." />
      <link rel="canonical" href="https://pomar.ai/" />

      {/* === HERO ===
          Solid inkwell panel over a faint 48px blueprint grid. One design
          at every width — only clamp() scaling and flex-wrap, no separate
          mobile layout and no absolute positioning. The proof strip
          lives inside the hero under a hairline divider. NOTE: the shared
          .hero/.hero-title/... classes in LandingPage.css belong to the
          product marketing pages now; this section uses hero-flat-*. */}
      <section className="hero-flat">
        <video className="hero-flat-video" autoPlay muted loop playsInline
          poster="/videos/hero-construction-poster.jpg">
          <source src="/videos/hero-construction.mp4" type="video/mp4" />
        </video>
        <div className="hero-flat-video-overlay"></div>
        <div className="hero-flat-scan">
          <div className="hero-flat-tag hero-flat-tag-1">RFI SIGNAL DETECTED</div>
          <div className="hero-flat-tag hero-flat-tag-2">CLASH REPORT — PARSED</div>
        </div>
        <div className="hero-flat-inner">
          <div className="hero-flat-eyebrow">Intelligence Infrastructure for Construction</div>
          <h1 className="hero-flat-title">
            <span className="hero-flat-line">Your project knows everything.</span>
            <span className="hero-flat-line hero-flat-accent">POMAR helps it remember.</span>
          </h1>
          <p className="hero-flat-sub">
            From inbox overload to clash report chaos, POMAR turns scattered project data into
            decisions general contractors can act on — without changing how their teams work.
          </p>
          <div className="hero-flat-cta">
            <button className="hero-flat-btn-primary" onClick={() => onProductSelect && onProductSelect('constructmail')}>
              Try POMAR Mail
            </button>
            <a href="/demo" className="hero-flat-btn-secondary">Book a Demo</a>
            <a href="#platform" className="hero-flat-link">Explore POMAR Clash and Vendors →</a>
          </div>

          <div className="hero-flat-proof">
            <div className="hero-flat-proof-label">Built with General Contractors</div>
            <div className="hero-flat-proof-chips">
              <div className="hero-flat-chip">GC Partner</div>
              <div className="hero-flat-chip">Builder</div>
              <div className="hero-flat-chip">VDC Team</div>
              <div className="hero-flat-chip">Industry Advisor</div>
            </div>
          </div>
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
      <section className="products" id="platform">
        <div className="section-inner">
          <div className="products-header">
            <div className="section-eyebrow">Platform</div>
            <h2 className="section-h2">One platform. Built one problem at a time.</h2>
            <p className="section-body centered">
              Start with one tool. Add the next when you're ready. Same login, same brand,
              same intelligence layer.
            </p>
          </div>

          <div className="product-grid">
            <div className="product-card live" onClick={() => goToMarketing('constructmail')}>
              <span className="product-badge badge-live">Live Now</span>
              <h3>POMAR Mail</h3>
              <div className="product-tagline">Email Intelligence</div>
              <p>AI triage for project email. Summarize threads, extract action items, detect RFI and change order signals — straight from your Gmail or Outlook inbox.</p>
              <span className="product-link">Learn more →</span>
            </div>

            <div className="product-card live" onClick={() => goToMarketing('clash')}>
              <span className="product-badge badge-live">Live Now</span>
              <h3>POMAR Clash</h3>
              <div className="product-tagline">BIM Clash Intelligence</div>
              <p>Upload a Navisworks clash report. Get severity scoring, top clashing element pairs, and AI-drafted RFIs ready to paste into Procore or Kahua — in seconds.</p>
              <span className="product-link">Learn more →</span>
            </div>

            <div className="product-card live" onClick={() => goToMarketing('vendors')}>
              <span className="product-badge badge-live">Live Now</span>
              <h3>POMAR Vendors</h3>
              <div className="product-tagline">Vendor Intelligence</div>
              <p>Find, vet, and track trusted subcontractors and suppliers. Insurance verification, star ratings across 5 trade categories, and one-click CSV or PDF export.</p>
              <span className="product-link">Learn more →</span>
            </div>

            <div className="product-card live" onClick={() => goToMarketing('marketplace')}>
              <span className="product-badge badge-live">Live Now</span>
              <h3>POMAR Marketplace</h3>
              <div className="product-tagline">Vendor Network Intelligence</div>
              <p>Opt in to share vendors from your own directory and browse listings shared by other GCs — every listing backed by real reviews from contractors who've actually worked with them.</p>
              <span className="product-link">Learn more →</span>
            </div>

            {/* Connect has no marketing page yet, so its card routes to the
                demo page instead of goToMarketing. */}
            <div className="product-card live" onClick={() => { window.location.href = '/demo'; }}>
              <span className="product-badge badge-live">Live Now</span>
              <h3>POMAR Connect</h3>
              <div className="product-tagline">PMIS Integration</div>
              <p>One action queue for everything POMAR detects. Review Mail and Clash signals, then push RFIs straight into Procore or Kahua — with an automation log of every action.</p>
              <span className="product-link">Book a demo →</span>
            </div>

            <div className="product-card live" onClick={() => goToMarketing('capital')}>
              <span className="product-badge badge-live">Live Now</span>
              <h3>POMAR Budget</h3>
              <div className="product-tagline">Budget Intelligence</div>
              <p>Budget-vs-actual per project, live instead of a shared spreadsheet — budgeted, committed, and actual by category, with milestones and work-item progress alongside the dollars.</p>
              <span className="product-link">Learn more →</span>
            </div>

            <div className="product-card live" onClick={() => goToMarketing('invoice_tracker')}>
              <span className="product-badge badge-live">Live Now</span>
              <h3>POMAR Invoices</h3>
              <div className="product-tagline">Invoice Intelligence</div>
              <p>Upload and track vendor invoices against your projects and budget — tag each one to a work item, track paid vs. pending, and extend read-only access to an outside accountant.</p>
              <span className="product-link">Learn more →</span>
            </div>

            <div className="product-card live" onClick={() => goToMarketing('daily_logs')}>
              <span className="product-badge badge-live">Live Now</span>
              <h3>POMAR Daily Logs</h3>
              <div className="product-tagline">Field Intelligence</div>
              <p>Replace the paper logbook. Log crew, weather, delays, and site photos from your phone in under two minutes — one live per-project record instead of a notebook in the site trailer.</p>
              <span className="product-link">Learn more →</span>
            </div>

            {/* Permit Tracker has no marketing page yet, so its card routes to the
                demo page instead of goToMarketing. */}
            <div className="product-card live" onClick={() => { window.location.href = '/demo'; }}>
              <span className="product-badge badge-live">Live Now</span>
              <h3>POMAR Permit Tracker</h3>
              <div className="product-tagline">Compliance Intelligence</div>
              <p>Track permit status, expiration dates, and issuing authority per project — get flagged automatically before a permit expires instead of finding out in the field.</p>
              <span className="product-link">Book a demo →</span>
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
          Pick the tool that solves your biggest problem today, and add the rest
          when you're ready.
        </p>
        <div className="hero-cta">
          <button className="btn-primary" onClick={() => onProductSelect && onProductSelect('constructmail')}>
            Try POMAR Mail
          </button>
          <button className="btn-primary" onClick={() => onProductSelect && onProductSelect('clash')}>
            Try POMAR Clash
          </button>
          <a href="/contact" className="btn-ghost">Talk to the Founder</a>
        </div>
      </section>

    </div>
  );
}
