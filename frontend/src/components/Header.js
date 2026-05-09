import React, { useState } from 'react';
import '../styles/Header.css';

export default function Header({ userId, onLogout }) {
  const [platformOpen, setPlatformOpen] = useState(false);

return (
    <header className="main-header">
      <div className="header-left">
        <a href="/">
          <img src="/logos/pomar.png" alt="pomar" className="header-logo" />
        </a>
      </div>

      <div className="header-right-section">
        <nav className="header-nav">
          <a href="/" className="header-link">Home</a>

          <div
            className="header-dropdown"
            onMouseEnter={() => setPlatformOpen(true)}
            onMouseLeave={() => setPlatformOpen(false)}
          >
            <button className="header-link dropdown-trigger">
              Platform ▾
            </button>
            {platformOpen && (
              <div className="dropdown-menu">
                <a href="/constructmail" className="dropdown-item">
                  📋 ConstructMail Intelligence
                </a>
              </div>
            )}
          </div>

          <a href="/about" className="header-link">About Us</a>
        </nav>

        <a href="/contact" className="header-cta">
          Free Consultation
        </a>

        {userId ? (
          <button onClick={onLogout} className="header-logout">
            Logout
          </button>
        ) : (
          <a href="/login" className="header-link">
            Login
          </a>
        )}
      </div>
    </header>
  );
}