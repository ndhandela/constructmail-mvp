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

function ClaimListingPrompt({ listingId }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/marketplace/claim-listing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name, listing_id: listingId }),
      });
      const data = await res.json();
      if (data.success) {
        setSent(true);
      } else {
        setError(data.detail || 'Could not submit claim. Try again.');
      }
    } catch {
      setError('Network error. Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (sent) {
    return (
      <div className="mp-claim-prompt" onClick={(e) => e.stopPropagation()}>
        <p>Check your email to confirm and start managing this listing.</p>
      </div>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        className="mp-claim-listing-btn"
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
      >
        Is this your business? Claim this listing
      </button>
    );
  }

  return (
    <form className="mp-claim-prompt" onSubmit={handleSubmit} onClick={(e) => e.stopPropagation()}>
      <input type="text" placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} required />
      <input type="email" placeholder="Work email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      <button type="submit" disabled={submitting}>{submitting ? 'Sending…' : 'Claim this listing'}</button>
      {error && <div className="mp-form-msg error">{error}</div>}
    </form>
  );
}

function GcSignupPrompt({ onSignedUp }) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/marketplace/gc-signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name }),
      });
      const data = await res.json();
      if (data.success) {
        setSent(true);
        if (onSignedUp) onSignedUp();
      } else {
        setError(data.detail || 'Could not sign up. Try again.');
      }
    } catch {
      setError('Network error. Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (sent) {
    return (
      <div className="mp-gc-signup-prompt" onClick={(e) => e.stopPropagation()}>
        <p>Check your email for a link to confirm your address and view full contact info.</p>
      </div>
    );
  }

  return (
    <form className="mp-gc-signup-prompt" onSubmit={handleSubmit} onClick={(e) => e.stopPropagation()}>
      <p>Sign up free to see contact info and full reviews for this vendor.</p>
      <input type="text" placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} required />
      <input type="email" placeholder="Work email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      <button type="submit" disabled={submitting}>{submitting ? 'Sending…' : 'Get full details'}</button>
      {error && <div className="mp-form-msg error">{error}</div>}
    </form>
  );
}

export default function MarketplaceVendorCard({ listing, userId }) {
  const [expanded, setExpanded] = useState(false);
  const [reviews, setReviews] = useState([]);
  const [fullDetails, setFullDetails] = useState(null);
  const [needsSignup, setNeedsSignup] = useState(false);
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
    if (expanded && !fullDetails && !needsSignup) {
      fetchFullDetails();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded]);

  const fetchFullDetails = async () => {
    // GET /listings/{id} is public and no longer returns contact info or
    // review text for anyone — that lives behind /full, gated by a
    // marketplace session token (see App.js's verify-token handling) rather
    // than the plain userId param the rest of this app uses.
    const sessionToken = localStorage.getItem('marketplace_sessionToken');
    if (!sessionToken) {
      setNeedsSignup(true);
      return;
    }
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/marketplace/listings/${listing.id}/full`,
        { headers: { Authorization: `Bearer ${sessionToken}` } }
      );
      if (res.status === 401) {
        setNeedsSignup(true);
        return;
      }
      const data = await res.json();
      if (data.success) {
        setFullDetails(data.listing);
        setReviews(data.reviews);
      }
    } catch (err) {
      console.error('Fetch full listing details error:', err);
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
          {needsSignup && !fullDetails && (
            <GcSignupPrompt onSignedUp={() => {}} />
          )}

          {listing.is_claimed === false && (
            <ClaimListingPrompt listingId={listing.id} />
          )}

          {fullDetails && fullDetails.contact_email && (
            <div className="mp-detail-row">
              <span className="mp-detail-label">Email</span>
              <span className="mp-detail-value">
                <a href={`mailto:${fullDetails.contact_email}`}>{fullDetails.contact_email}</a>
              </span>
            </div>
          )}
          {fullDetails && fullDetails.contact_phone && (
            <div className="mp-detail-row">
              <span className="mp-detail-label">Phone</span>
              <span className="mp-detail-value">{fullDetails.contact_phone}</span>
            </div>
          )}
          {fullDetails && fullDetails.website && (
            <div className="mp-detail-row">
              <span className="mp-detail-label">Website</span>
              <span className="mp-detail-value">
                <a href={fullDetails.website} target="_blank" rel="noopener noreferrer">
                  {fullDetails.website}
                </a>
              </span>
            </div>
          )}
          {fullDetails && fullDetails.description && (
            <p className="mp-description">{fullDetails.description}</p>
          )}

          {fullDetails && canSaveToProject && (
            <button
              className="mp-save-to-project-btn"
              onClick={handleSaveToProject}
              disabled={saving || saved}
            >
              {saved ? '✓ Saved to project' : saving ? 'Saving…' : '📌 Save to project'}
            </button>
          )}

          {/* Reviews — only available once full details have unlocked */}
          {fullDetails && reviews.length > 0 && (
            <div className="mp-reviews-section">
              <h4>Reviews</h4>
              {reviews.map((r) => (
                <div key={r.id} className="mp-review-item">
                  <div className="mp-review-meta">
                    <Stars rating={r.rating} />
                    {r.reviewer_company_name && (
                      <span className="mp-review-author">{r.reviewer_company_name}</span>
                    )}
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

          {fullDetails && (
            <MarketplaceReviewForm
              listingId={listing.id}
              userId={userId}
              onReviewSubmitted={handleReviewSubmitted}
            />
          )}
        </div>
      )}
    </div>
  );
}
