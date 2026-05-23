import React, { useState } from 'react';
import '../styles/VendorCard.css';

export default function VendorCard({ vendor }) {
  const [showDetails, setShowDetails] = useState(false);

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
      </div>

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