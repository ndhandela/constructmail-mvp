import React from 'react';
import VendorCard from './VendorCard';
import '../styles/VendorList.css';

export default function VendorList({ vendors, loading, pagination, onNextPage, onPrevPage }) {
  if (loading) {
    return <div className="vendor-list-loading">Loading vendors...</div>;
  }

  if (vendors.length === 0) {
    return (
      <div className="vendor-list-empty">
        <p>No vendors found. Try adjusting your filters.</p>
      </div>
    );
  }

  const hasNextPage = pagination.offset + pagination.limit < pagination.total;
  const hasPrevPage = pagination.offset > 0;

  return (
    <div className="vendor-list">
      <div className="vendor-list-header">
        <h2>Vendors ({pagination.total})</h2>
        <p className="page-info">
          Showing {pagination.offset + 1}-{Math.min(pagination.offset + pagination.limit, pagination.total)} 
          of {pagination.total}
        </p>
      </div>

      <div className="vendors-grid">
        {vendors.map(vendor => (
          <VendorCard key={vendor.id} vendor={vendor} />
        ))}
      </div>

      <div className="pagination">
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