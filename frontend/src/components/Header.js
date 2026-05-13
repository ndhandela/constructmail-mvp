import React, { useState } from 'react';
import PomarLogo from './PomarLogo';
import '../styles/Header.css';

export default function Header({ userId, onLogout }) {
  const [platformOpen, setPlatformOpen] = useState(false);

  return (
    <header className="main-header">
      <div className="header-left">
        <a href="/" className="header-logo-link" aria-label="POMAR home">
          <PomarLogo variant="light" height={32} />
        </a>
      </div>

      <nav className="header-nav">
        <a href="/" className="header-link">Home</a>

        <div
          className="header-dropdown"
          onMouseEnter={() => setPlatformOpen(true)}
          onMouseLeave={() => setPlatformOpen(false)}
        >
          <button className="header-link dropdown-trigger">
            Platform <span className="caret">▾</span>
          </button>
          {platformOpen && (
            <div className="dropdown-menu">
              <a href="/constructmail" className="dropdown-item">
                <span className="dropdown-item-tag">Live</span>
                <div>
                  <div className="dropdown-item-title">POMAR Mail</div>
                  <div className="dropdown-item-sub">ConstructMail Intelligence</div>
                </div>
              </a>
            </div>
          )}
        </div>

        <a href="/about" className="header-link">About</a>
      </nav>

      <div className="header-right">
        <a href="/contact" className="header-cta">Book a Demo</a>
        {userId ? (
          <button onClick={onLogout} className="header-logout">Logout</button>
        ) : (
          <a href="/login" className="header-logout">Login</a>
        )}
      </div>
    </header>
  );
}
