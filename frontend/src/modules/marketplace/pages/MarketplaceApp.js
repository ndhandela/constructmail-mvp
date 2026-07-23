import React, { useState, useEffect } from 'react';
import MarketplaceListings from '../components/MarketplaceListings';
import '../styles/Marketplace.css';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

export default function MarketplaceApp({ user, userId }) {
  const [hasLicense, setHasLicense] = useState(null); // null = checking
  const [types, setTypes] = useState([]);
  const [activeType, setActiveType] = useState('vendor');

  useEffect(() => {
    checkLicense();
    fetchTypes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const checkLicense = async () => {
    try {
      // GET /listings is now public/unauthenticated (no 403 possible), so
      // license status is checked via its own dedicated endpoint instead.
      const res = await fetch(
        `${API_BASE_URL}/api/marketplace/license?userId=${userId}`
      );
      const data = await res.json();
      setHasLicense(!!data.hasLicense);
    } catch {
      setHasLicense(false);
    }
  };

  const fetchTypes = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/marketplace/types`);
      const data = await res.json();
      if (data.success && data.types.length > 0) {
        setTypes(data.types);
        setActiveType(data.types[0].slug);
      }
    } catch (err) {
      console.error('Fetch types error:', err);
    }
  };

  if (hasLicense === null) {
    return <div className="mp-loading" style={{ paddingTop: 80 }}>Loading…</div>;
  }

  if (!hasLicense) {
    return (
      <div className="marketplace-app">
        <div className="marketplace-upgrade">
          <div className="upgrade-icon">🏪</div>
          <h2>POMAR Marketplace</h2>
          <p>
            Discover and share trusted vendors across your network.
            Upgrade your plan to unlock the Marketplace module.
          </p>
          <a href="/contact" className="upgrade-btn">Contact Us to Upgrade</a>
        </div>
      </div>
    );
  }

  return (
    <div className="marketplace-app">
      <div className="marketplace-hero">
        <div className="marketplace-badge">Marketplace</div>
        <h1>POMAR Marketplace</h1>
        <p>Discover trusted vendors shared across the POMAR network</p>
      </div>

      {types.length > 1 && (
        <nav className="marketplace-nav">
          {types.map((t) => (
            <button
              key={t.slug}
              className={`marketplace-nav-tab ${activeType === t.slug ? 'active' : ''}`}
              onClick={() => setActiveType(t.slug)}
            >
              {t.label}
            </button>
          ))}
        </nav>
      )}

      <div className="marketplace-container">
        <MarketplaceListings
          userId={userId}
          activeType={activeType}
        />
      </div>
    </div>
  );
}
