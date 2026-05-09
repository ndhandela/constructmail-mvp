import React from 'react';
import '../styles/AboutUs.css';

export default function AboutUs() {
  return (
    <div className="about-container">

      {/* Hero */}
      <section className="about-hero">
        <h1>Built by construction tech insiders,<br />for the people who build America.</h1>
        <p>TechDen Solutions — Prosper, TX</p>
      </section>

      {/* Our Story */}
      <section className="about-section">
        <div className="about-content">
          <h2>Our Story</h2>
          <p>After years implementing construction technology for General Contractors across the country, we watched project managers drown in email threads — missing change orders, losing track of RFIs, spending hours manually extracting action items from long email chains.</p>
          <p>So we built ConstructMail Intelligence — an AI tool that does in 3 seconds what used to take 30 minutes.</p>
          <p>TechDen Solutions is our consulting firm, helping GCs adopt and implement construction technology that actually works.</p>
        </div>
      </section>

      {/* What We Do */}
      <section className="about-section alt-bg">
        <div className="about-content">
          <h2>What We Do</h2>
          <div className="about-cards">
            <div className="about-card">
              <div className="about-card-icon">🏗️</div>
              <h3>Construction Technology Consulting</h3>
              <p>We help General Contractors evaluate, implement, and get value from construction technology.</p>
            </div>
            <div className="about-card">
              <div className="about-card-icon">🤖</div>
              <h3>AI-Powered Tools</h3>
              <p>We build intelligent tools like ConstructMail Intelligence that solve real problems on real job sites.</p>
            </div>
            <div className="about-card">
              <div className="about-card-icon">🎓</div>
              <h3>Implementation & Training</h3>
              <p>We don't just set up software — we train your team and make sure adoption actually happens.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Where We Are */}
      <section className="about-section">
        <div className="about-content">
          <h2>Where We Are</h2>
          <p>Based in Prosper, TX — serving General Contractors across the DFW area and beyond.</p>
        </div>
      </section>

      {/* CTA */}
      <section className="about-cta">
        <div className="about-content">
          <h2>Ready to modernize your project communications?</h2>
          <p>Let's talk about how ConstructMail Intelligence can work for your team.</p>
          <a href="/contact" className="about-cta-btn">
            Book a Free Consultation
          </a>
        </div>
      </section>

    </div>
  );
}