import React, { useState, useRef } from 'react';
import PomarLogo from './PomarLogo';
import '../styles/Header.css';

export default function Header() {
  const [platformOpen, setPlatformOpen] = useState(false);
  const closeTimer = useRef(null);

  const handleMouseEnter = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setPlatformOpen(true);
  };

  const handleMouseLeave = () => {
    closeTimer.current = setTimeout(() => setPlatformOpen(false), 200);
  };

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
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
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
        <a href="/login" className="header-btn-login">Login</a>
        <a href="/" className="header-btn-book">Book a Demo</a>
      </div>
    </header>
  );
}