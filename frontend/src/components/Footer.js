import React from 'react';
import '../styles/Footer.css';

export default function Footer() {
  return (
    <footer className="footer">
      <p>
        © 2025 TechDen Solutions &nbsp;|&nbsp;
        <a href="/privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</a>
        &nbsp;|&nbsp;
        <a href="mailto:info@techdensolutions.com">Contact</a>
      </p>
    </footer>
  );
}