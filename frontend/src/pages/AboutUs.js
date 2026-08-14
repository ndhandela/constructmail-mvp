import React from 'react';
import '../styles/AboutUs.css';

export default function AboutUs() {
  return (
    <div className="about-container">
      <title>About Us | POMAR</title>
      <meta name="description" content="POMAR is built by TechDen Solutions, a construction technology consulting firm in Prosper, TX, helping General Contractors turn scattered project data into decisions they can act on." />
      <link rel="canonical" href="https://pomar.ai/about" />

      {/* Hero */}
      <section className="about-hero" style={{ backgroundImage: "url(/images/hero-about.jpg)" }}>
        <div className="page-hero-overlay"></div>
        <div className="about-eyebrow">About TechDen</div>
        <h1>
          Built by construction tech insiders,<br />
          <em>for the people who build America.</em>
        </h1>
        <p className="about-hero-sub">TechDen Solutions · Prosper, TX</p>
      </section>

      {/* Our Story */}
      <section className="about-section">
        <div className="about-content">
          <div className="about-section-eyebrow">Our Story</div>
          <h2>After years of watching projects drown in their own data.</h2>
          <p>
            We spent years implementing construction technology for General Contractors across the country.
            And every project, on every job site, we watched the same thing happen.
          </p>
          <p>
            Project managers drowning in email threads. Change orders buried in the 200th reply.
            RFIs lost in the shuffle. Hours every week manually extracting action items from long chains
            that everyone was supposed to read but nobody had time to.
          </p>
          <p>
            So we built POMAR — an intelligence layer that surfaces what matters from the noise GCs
            already have. Our first product, POMAR Mail, does in three seconds what
            used to take thirty minutes.
          </p>
          <p>
            TechDen Solutions is the consulting firm behind POMAR — helping General Contractors adopt and
            implement construction technology that actually works in the field.
          </p>
        </div>
      </section>

      {/* What We Do */}
      <section className="about-section alt-bg">
        <div className="about-content">
          <div className="about-section-eyebrow">What We Do</div>
          <h2>Three ways we help GCs.</h2>
          <div className="about-cards">
            <div className="about-card">
              <div className="about-card-num">01</div>
              <h3>Construction Technology Consulting</h3>
              <p>We help General Contractors evaluate, implement, and get value from the construction technology stack.</p>
            </div>
            <div className="about-card">
              <div className="about-card-num">02</div>
              <h3>AI-Powered Tools</h3>
              <p>We build intelligent tools like POMAR Mail that solve real problems on real job sites — not feature checklists for buyers.</p>
            </div>
            <div className="about-card">
              <div className="about-card-num">03</div>
              <h3>Implementation & Training</h3>
              <p>We don't just set up software. We train your team and make sure adoption actually happens — because tech that doesn't get used isn't worth paying for.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Where We Are */}
      <section className="about-section">
        <div className="about-content">
          <div className="about-section-eyebrow">Where We Are</div>
          <h2>Based in DFW. Serving GCs everywhere.</h2>
          <p>
            Headquartered in Prosper, TX — building deep relationships with General Contractors across
            the Dallas-Fort Worth area, with clients and partners across the country.
          </p>
        </div>
      </section>

      {/* CTA */}
      <section className="about-cta">
        <div className="about-content">
          <h2>Ready to modernize your project communications?</h2>
          <p>Let's talk about how POMAR can work for your team.</p>
          <a href="/contact" className="about-cta-btn">
            Book a Free Consultation
          </a>
        </div>
      </section>

    </div>
  );
}
