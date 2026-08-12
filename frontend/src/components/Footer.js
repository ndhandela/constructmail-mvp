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
            <a href="/mail-info">POMAR Mail</a>
            <a href="/clash-info">POMAR Clash</a>
            <a href="/vendors-info">POMAR Vendors</a>
            <a href="/marketplace-info">POMAR Marketplace</a>
            <a href="/demo">POMAR Connect</a>
            <a href="/budget-info">POMAR Budget</a>
            <a href="/invoices-info">POMAR Invoices</a>
            <a href="/daily-logs-info">POMAR Daily Logs</a>
            <a href="/demo">POMAR Permit Tracker</a>
            <a href="/demo">POMAR Trust</a>
            <a href="/demo">Book a Demo</a>
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
