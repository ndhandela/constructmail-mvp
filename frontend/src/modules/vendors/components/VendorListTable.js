import React, { useState } from 'react';
import VendorReviews from './VendorReviews';
import '../styles/VendorListTable.css';

export default function VendorListTable({ vendors, loading, pagination, onNextPage, onPrevPage, userId, onVendorUpdated }) {
  const [expandedId, setExpandedId] = useState(null);

  if (loading) {
    return <div className="vendor-list-loading">Loading vendors...</div>;
  }

  if (vendors.length === 0) {
    return (
      <div className="vendor-list-empty">
        <p>No vendors found. Try adjusting your filters or add a new vendor.</p>
      </div>
    );
  }

  const hasNextPage = pagination.offset + pagination.limit < pagination.total;
  const hasPrevPage = pagination.offset > 0;

  const getInsuranceColor = (status) => {
    const colors = {
      verified: '#10B981',
      pending: '#F59E0B',
      not_verified: '#EF4444'
    };
    return colors[status] || '#9CA3AF';
  };

  const getInsuranceLabel = (status) => {
    const labels = {
      verified: 'Verified',
      pending: 'Pending',
      not_verified: 'Not Verified'
    };
    return labels[status] || 'Unknown';
  };

  return (
    <div className="vendor-list-table-wrapper">
      <div className="vendor-list-header">
        <h2>Vendors ({pagination.total})</h2>
        <p className="page-info">
          Showing {pagination.offset + 1}-{Math.min(pagination.offset + pagination.limit, pagination.total)}
          of {pagination.total}
        </p>
      </div>

      <div className="vendor-table-container">
        <table className="vendor-table">
          <thead>
            <tr>
              <th>Vendor Name</th>
              <th>Trade</th>
              <th>Location</th>
              <th>Contact</th>
              <th>Insurance</th>
              <th>Rating</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {vendors.map(vendor => (
              <React.Fragment key={vendor.id}>
                <tr className={`vendor-row${expandedId === vendor.id ? ' vendor-row--expanded' : ''}`}>
                  <td className="vendor-name">{vendor.name}</td>
                  <td className="vendor-trade">{vendor.trade}</td>
                  <td className="vendor-location">
                    {vendor.city}, {vendor.state}
                  </td>
                  <td className="vendor-contact">
                    {vendor.phone && <a href={`tel:${vendor.phone}`}>{vendor.phone}</a>}
                    {vendor.email && vendor.phone && <br />}
                    {vendor.email && <a href={`mailto:${vendor.email}`}>{vendor.email}</a>}
                  </td>
                  <td className="vendor-insurance">
                    <span
                      className="insurance-badge"
                      style={{ backgroundColor: getInsuranceColor(vendor.insurance_status) }}
                    >
                      {getInsuranceLabel(vendor.insurance_status)}
                    </span>
                  </td>
                  <td className="vendor-rating">
                    <div className="rating-info">
                      <span className="stars">
                        {'⭐'.repeat(Math.floor(parseFloat(vendor.avg_rating) || 0))}
                      </span>
                      <span className="rating-value">{(parseFloat(vendor.avg_rating) || 0).toFixed(1)}</span>
                      <span className="review-count">({vendor.review_count || 0})</span>
                    </div>
                  </td>
                  <td className="vendor-action">
                    <button
                      className="expand-btn"
                      onClick={() => setExpandedId(expandedId === vendor.id ? null : vendor.id)}
                      title={expandedId === vendor.id ? 'Collapse' : 'View details & reviews'}
                    >
                      {expandedId === vendor.id ? '▼' : '▶'}
                    </button>
                  </td>
                </tr>

                {expandedId === vendor.id && (
                  <tr className="vendor-details-row">
                    <td colSpan="7">
                      {/* ── Quick info strip ── */}
                      <div className="vendor-details">
                        {vendor.address && (
                          <div className="detail-item">
                            <span className="detail-label">Address:</span>
                            <span className="detail-value">
                              {vendor.address}{vendor.zip ? `, ${vendor.zip}` : ''}
                            </span>
                          </div>
                        )}
                        {vendor.website && (
                          <div className="detail-item">
                            <span className="detail-label">Website:</span>
                            <a href={vendor.website} target="_blank" rel="noopener noreferrer" className="detail-value">
                              {vendor.website}
                            </a>
                          </div>
                        )}
                        <div className="detail-item">
                          <span className="detail-label">Joined:</span>
                          <span className="detail-value">{new Date(vendor.created_at).toLocaleDateString()}</span>
                        </div>
                      </div>

                      {/* ── Reviews ── */}
                      <VendorReviews
                        vendor={vendor}
                        userId={userId}
                        onReviewAdded={onVendorUpdated}
                      />
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <div className="vendor-pagination">
        <button
          onClick={onPrevPage}
          disabled={!hasPrevPage || loading}
          className="pagination-btn"
        >
          ← Previous
        </button>

        <span className="pagination-info">
          Page {Math.floor(pagination.offset / pagination.limit) + 1}
        </span>

        <button
          onClick={onNextPage}
          disabled={!hasNextPage || loading}
          className="pagination-btn"
        >
          Next →
        </button>
      </div>
    </div>
  );
}
