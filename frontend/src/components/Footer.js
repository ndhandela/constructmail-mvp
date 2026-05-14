import React from 'react';
import PomarLogo from './PomarLogo';
import '../styles/Footer.css';

export default function Footer() {
  return (
    <footer className="footer">
      <div className="footer-inner">
        <div className="footer-brand">
          <PomarLogo variant="dark" height={28} />
          <p className="footer-tagline">Intelligence Infrastructure for General Contractors</p>
        </div>
        
        <div className="footer-columns">
          <div className="footer-col">
            <h4>Product</h4>
            <a href="/constructmail">POMAR Mail</a>
            <a href="/contact">Book a Demo</a>
          </div>
          <div className="footer-col">
            <h4>Company</h4>
            <a href="/about">About</a>
            <a href="/contact">Contact</a>
          </div>
          <div className="footer-col">
            <h4>Legal</h4>
            <a href="/privacy">Privacy Policy</a>
          </div>
        </div>
      </div>
      
      <div className="footer-bottom">
        <span>© 2025 TechDen Solutions · Prosper, TX</span>
        <span>connect@techdensolutions.com</span>
      </div>
    </footer>
  );
}
