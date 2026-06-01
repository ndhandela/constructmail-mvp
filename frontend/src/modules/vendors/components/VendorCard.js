import React, { useState } from 'react';
import '../styles/VendorCard.css';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

export default function VendorCard({ vendor, userId, hasMarketplaceLicense, onVendorUpdated }) {
  const [showDetails, setShowDetails] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [shareMsg, setShareMsg] = useState(null);
  const [sharedToMarketplace, setSharedToMarketplace] = useState(
    vendor.shared_to_marketplace || false
  );

  const handleShareToMarketplace = async (e) => {
    e.stopPropagation();
    setSharing(true);
    setShareMsg(null);
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/marketplace/vendors/${vendor.id}/share-to-marketplace?userId=${userId}`,
        { method: 'POST' }
      );
      const data = await res.json();
      if (data.success) {
        setSharedToMarketplace(true);
        setShareMsg({ type: 'success', text: 'Shared to Marketplace!' });
        if (onVendorUpdated) onVendorUpdated(data.vendor);
        setTimeout(() => setShareMsg(null), 3000);
      } else {
        setShareMsg({ type: 'error', text: data.detail || 'Could not share vendor.' });
      }
    } catch {
      setShareMsg({ type: 'error', text: 'Network error. Try again.' });
    } finally {
      setSharing(false);
    }
  };

  const getInsuranceColor = (status) => {
    const colors = {
      verified: '#10B981',
      pending: '#F59E0B',
      not_verified: '#EF4444',
      null: '#9CA3AF'
    };
    return colors[status] || colors.null;
  };

  const getInsuranceLabel = (status) => {
    const labels = {
      verified: 'Verified',
      pending: 'Pending',
      not_verified: 'Not Verified',
      null: 'Unknown'
    };
    return labels[status] || labels.null;
  };

  const rating = parseFloat(vendor.avg_rating) || 0;

  return (
    <div className="vendor-card">
      <div className="vendor-card-header">
        <h3>{vendor.name}</h3>
        <span className="vendor-trade">{vendor.trade}</span>
      </div>

      <div className="vendor-rating">
        <div className="stars">
          {'⭐'.repeat(Math.floor(rating))}
          {rating % 1 >= 0.5 ? '⭐' : ''}
        </div>
        <span className="rating-value">{rating.toFixed(1)}</span>
        <span className="review-count">({vendor.review_count} reviews)</span>
      </div>

      <div className="vendor-info">
        <div className="info-item">
          <span className="info-label">Location</span>
          <span className="info-value">{vendor.city}, {vendor.state}</span>
        </div>

        {vendor.phone && (
          <div className="info-item">
            <span className="info-label">Phone</span>
            <span className="info-value">{vendor.phone}</span>
          </div>
        )}

        {vendor.email && (
          <div className="info-item">
            <span className="info-label">Email</span>
            <span className="info-value">{vendor.email}</span>
          </div>
        )}

        <div className="info-item">
          <span className="info-label">Insurance</span>
          <span 
            className="status-badge"
            style={{ backgroundColor: getInsuranceColor(vendor.insurance_status) }}
          >
            {getInsuranceLabel(vendor.insurance_status)}
          </span>
        </div>
      </div>

      <div className="vendor-card-actions">
        <button
          className="details-btn"
          onClick={() => setShowDetails(!showDetails)}
        >
          {showDetails ? 'Hide Details' : 'View Details'}
        </button>

        {sharedToMarketplace ? (
          <span className="share-marketplace-badge">✓ Shared to Marketplace</span>
        ) : hasMarketplaceLicense ? (
          <button
            className="share-marketplace-btn"
            onClick={handleShareToMarketplace}
            disabled={sharing}
          >
            {sharing ? 'Sharing…' : '🌐 Share to Marketplace'}
          </button>
        ) : (
          <span
            className="share-marketplace-btn disabled"
            title="Marketplace license required"
          >
            🌐 Share to Marketplace
          </span>
        )}
      </div>

      {shareMsg && (
        <div className={`share-msg share-msg--${shareMsg.type}`}>{shareMsg.text}</div>
      )}

      {showDetails && (
        <div className="vendor-details">
          {vendor.address && <p><strong>Address:</strong> {vendor.address}</p>}
          {vendor.website && (
            <p>
              <strong>Website:</strong>{' '}
              <a href={vendor.website} target="_blank" rel="noopener noreferrer">
                {vendor.website}
              </a>
            </p>
          )}
          <p><strong>Joined:</strong> {new Date(vendor.created_at).toLocaleDateString()}</p>
        </div>
      )}
    </div>
  );
}