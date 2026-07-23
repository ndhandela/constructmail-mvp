import React, { useState, useEffect } from 'react';
import MarketplaceListings from '../../modules/marketplace/components/MarketplaceListings';
import '../../modules/marketplace/styles/Marketplace.css';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

// Public, unauthenticated marketplace directory — GET /api/marketplace/listings
// requires no auth/license and returns only name/trade/city-state/rating/verified
// (see routers/marketplace.py). Reuses the same MarketplaceListings /
// MarketplaceVendorCard components the in-app authenticated experience uses:
// MarketplaceVendorCard already degrades correctly for a logged-out visitor
// (no session token -> shows the "sign up to see full details" prompt instead
// of contact info/reviews when a card is expanded).
export default function MarketplacePublicBrowse() {
  const [types, setTypes] = useState([]);
  const [activeType, setActiveType] = useState('vendor');

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/marketplace/types`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.types.length > 0) {
          setTypes(data.types);
          setActiveType(data.types[0].slug);
        }
      })
      .catch((err) => console.error('Fetch types error:', err));
  }, []);

  return (
    <div className="marketplace-app">
      <div className="marketplace-hero">
        <div className="marketplace-badge">Marketplace</div>
        <h1>POMAR Marketplace</h1>
        <p>Browse vendors trusted by general contractors across the POMAR network.</p>
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
        <MarketplaceListings activeType={activeType} />
      </div>
    </div>
  );
}
