import React, { useState, useEffect, useContext } from 'react';
import MarketplaceReviewForm from './MarketplaceReviewForm';
import { ProjectContext, ALL_PROJECTS } from '../../../contexts/ProjectContext';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

function Stars({ rating }) {
  const full = Math.floor(rating);
  const half = rating - full >= 0.5;
  return (
    <span className="mp-stars">
      {'★'.repeat(full)}
      {half ? '½' : ''}
      {'☆'.repeat(5 - full - (half ? 1 : 0))}
    </span>
  );
}

export default function MarketplaceVendorCard({ listing, userId }) {
  const [expanded, setExpanded] = useState(false);
  const [reviews, setReviews] = useState([]);
  const [avgRating, setAvgRating] = useState(parseFloat(listing.avg_rating) || 0);
  const [reviewCount, setReviewCount] = useState(listing.review_count || 0);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const { currentProjectId } = useContext(ProjectContext);
  const canSaveToProject = currentProjectId && currentProjectId !== ALL_PROJECTS;

  const handleSaveToProject = async (e) => {
    e.stopPropagation();
    if (!canSaveToProject || saving) return;
    setSaving(true);
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/marketplace/listings/${listing.id}/save-to-project?userId=${userId}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId: Number(currentProjectId) }),
        }
      );
      const data = await res.json();
      if (data.success) setSaved(true);
    } catch (err) {
      console.error('Save to project error:', err);
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (expanded && reviews.length === 0 && listing.review_count > 0) {
      fetchReviews();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded]);

  const fetchReviews = async () => {
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/marketplace/listings/${listing.id}?userId=${userId}`
      );
      const data = await res.json();
      if (data.success) setReviews(data.reviews);
    } catch (err) {
      console.error('Fetch reviews error:', err);
    }
  };

  const handleReviewSubmitted = (newReview) => {
    setReviews((prev) => [newReview, ...prev]);
    const total = avgRating * reviewCount + newReview.rating;
    const newCount = reviewCount + 1;
    setReviewCount(newCount);
    setAvgRating(total / newCount);
  };

  return (
    <div
      className={`mp-vendor-card ${expanded ? 'expanded' : ''}`}
      onClick={() => setExpanded((v) => !v)}
    >
      <div className="mp-card-header">
        <h3>{listing.name}</h3>
        {listing.trade && <span className="mp-trade-badge">{listing.trade}</span>}
      </div>

      <div className="mp-rating">
        <Stars rating={avgRating} />
        <span className="mp-rating-num">{avgRating.toFixed(1)}</span>
        <span className="mp-review-count">({reviewCount} reviews)</span>
      </div>

      {listing.location && (
        <div className="mp-location">📍 {listing.location}</div>
      )}

      {expanded && (
        <div
          className="mp-detail"
          onClick={(e) => e.stopPropagation()}
        >
          {listing.contact_email && (
            <div className="mp-detail-row">
              <span className="mp-detail-label">Email</span>
              <span className="mp-detail-value">
                <a href={`mailto:${listing.contact_email}`}>{listing.contact_email}</a>
              </span>
            </div>
          )}
          {listing.contact_phone && (
            <div className="mp-detail-row">
              <span className="mp-detail-label">Phone</span>
              <span className="mp-detail-value">{listing.contact_phone}</span>
            </div>
          )}
          {listing.website && (
            <div className="mp-detail-row">
              <span className="mp-detail-label">Website</span>
              <span className="mp-detail-value">
                <a href={listing.website} target="_blank" rel="noopener noreferrer">
                  {listing.website}
                </a>
              </span>
            </div>
          )}
          {listing.description && (
            <p className="mp-description">{listing.description}</p>
          )}

          {canSaveToProject && (
            <button
              className="mp-save-to-project-btn"
              onClick={handleSaveToProject}
              disabled={saving || saved}
            >
              {saved ? '✓ Saved to project' : saving ? 'Saving…' : '📌 Save to project'}
            </button>
          )}

          {/* Reviews */}
          {reviews.length > 0 && (
            <div className="mp-reviews-section">
              <h4>Reviews</h4>
              {reviews.map((r) => (
                <div key={r.id} className="mp-review-item">
                  <div className="mp-review-meta">
                    <Stars rating={r.rating} />
                    <span className="mp-review-date">
                      {new Date(r.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  {r.comment && (
                    <div className="mp-review-comment">{r.comment}</div>
                  )}
                </div>
              ))}
            </div>
          )}

          <MarketplaceReviewForm
            listingId={listing.id}
            userId={userId}
            onReviewSubmitted={handleReviewSubmitted}
          />
        </div>
      )}
    </div>
  );
}
