import React, { useState, useEffect } from 'react';
import MarketplaceVendorCard from '../../modules/marketplace/components/MarketplaceVendorCard';
import '../../modules/marketplace/styles/Marketplace.css';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

// Interactive counterpart to the server-rendered SEO shell at
// GET /marketplace/listings/{id} (routers/marketplace.py's pages_router) —
// that route serves crawlers/first-paint HTML; a real browser lands here
// (via the shell's "View full details" link, or by navigating directly)
// for the interactive card, gated the same way as the in-app experience.
export default function MarketplaceListingDetail({ listingId, userId }) {
  const [listing, setListing] = useState(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/marketplace/listings/${listingId}`)
      .then((res) => {
        if (res.status === 404) { setNotFound(true); return null; }
        return res.json();
      })
      .then((data) => { if (data && data.success) setListing(data.listing); })
      .catch((err) => console.error('Fetch listing error:', err));
  }, [listingId]);

  if (notFound) {
    return (
      <div className="marketplace-app">
        <div className="marketplace-hero"><h1>Listing not found</h1></div>
      </div>
    );
  }

  if (!listing) {
    return <div className="mp-loading" style={{ paddingTop: 80 }}>Loading…</div>;
  }

  return (
    <div className="marketplace-app">
      <div className="marketplace-container" style={{ maxWidth: 560, margin: '40px auto' }}>
        <MarketplaceVendorCard listing={listing} userId={userId} />
      </div>
    </div>
  );
}
