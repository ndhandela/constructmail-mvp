import React, { useState, useEffect } from 'react';
import MarketplaceVendorCard from './MarketplaceVendorCard';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

export default function MarketplaceListings({ userId, activeType }) {
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetchListings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeType]);

  const fetchListings = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ userId });
      if (activeType) params.set('type', activeType);
      const res = await fetch(`${API_BASE_URL}/api/marketplace/listings?${params}`);
      const data = await res.json();
      if (data.success) setListings(data.listings);
    } catch (err) {
      console.error('Fetch listings error:', err);
    } finally {
      setLoading(false);
    }
  };

  const filtered = listings.filter((l) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (l.name || '').toLowerCase().includes(q) ||
      (l.trade || '').toLowerCase().includes(q)
    );
  });

  if (loading) return <div className="mp-loading">Loading listings…</div>;

  return (
    <div>
      <div className="marketplace-search-bar">
        <input
          type="text"
          placeholder="Search by name or trade…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {filtered.length === 0 ? (
        <div className="mp-empty">
          {search ? 'No results match your search.' : 'No listings yet.'}
        </div>
      ) : (
        <div className="marketplace-grid">
          {filtered.map((listing) => (
            <MarketplaceVendorCard
              key={listing.id}
              listing={listing}
              userId={userId}
            />
          ))}
        </div>
      )}
    </div>
  );
}
