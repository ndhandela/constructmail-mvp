import React, { useState, useEffect, useCallback } from 'react';
import '../styles/VendorReviews.css';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

const CATEGORIES = [
  { key: 'rating_reliability', label: 'Reliability' },
  { key: 'rating_cost', label: 'Cost / Value' },
  { key: 'rating_quality', label: 'Work Quality' },
  { key: 'rating_communication', label: 'Communication' },
  { key: 'rating_insurance', label: 'Insurance / Docs' },
];

function StarDisplay({ value, max = 5, size = 'sm' }) {
  const filled = Math.round(parseFloat(value) || 0);
  return (
    <span className={`star-display star-display--${size}`}>
      {Array.from({ length: max }).map((_, i) => (
        <span key={i} className={i < filled ? 'star star--filled' : 'star star--empty'}>★</span>
      ))}
    </span>
  );
}

function RatingBar({ label, value }) {
  const pct = ((parseFloat(value) || 0) / 5) * 100;
  return (
    <div className="rating-bar-row">
      <span className="rating-bar-label">{label}</span>
      <div className="rating-bar-track">
        <div className="rating-bar-fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="rating-bar-value">{(parseFloat(value) || 0).toFixed(1)}</span>
    </div>
  );
}

export default function VendorReviews({ vendor, userId, onReviewAdded }) {
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [averages, setAverages] = useState(null);

  const fetchReviews = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/vendors/${vendor.id}/reviews?limit=50`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token') || ''}` }
      });
      const data = await res.json();
      if (data.success) {
        setReviews(data.reviews);
        if (data.reviews.length > 0) {
          const avg = {};
          CATEGORIES.forEach(({ key }) => {
            const sum = data.reviews.reduce((acc, r) => acc + (parseFloat(r[key]) || 0), 0);
            avg[key] = sum / data.reviews.length;
          });
          setAverages(avg);
        }
      }
    } catch (err) {
      console.error('Fetch reviews error:', err);
    } finally {
      setLoading(false);
    }
  }, [vendor.id]);

  useEffect(() => {
    fetchReviews();
  }, [fetchReviews]);

  const handleReviewSubmitted = () => {
    setShowForm(false);
    fetchReviews();
    if (onReviewAdded) onReviewAdded();
  };

  const overallAvg = parseFloat(vendor.avg_rating) || 0;

  return (
    <div className="vendor-reviews">
      {/* ── Left: aggregate stats ── */}
      <div className="reviews-left">
        <div className="reviews-aggregate">
          <div className="aggregate-score">
            <span className="aggregate-number">{overallAvg.toFixed(1)}</span>
            <StarDisplay value={overallAvg} size="lg" />
            <span className="aggregate-count">
              {vendor.review_count || 0} {vendor.review_count === 1 ? 'review' : 'reviews'}
            </span>
          </div>

          {averages && (
            <div className="category-bars">
              {CATEGORIES.map(({ key, label }) => (
                <RatingBar key={key} label={label} value={averages[key]} />
              ))}
            </div>
          )}
        </div>

        <button
          className="write-review-btn"
          onClick={() => setShowForm(f => !f)}
        >
          {showForm ? '✕ Cancel' : '✏️ Write a Review'}
        </button>

        {showForm && (
          <ReviewForm
            vendorId={vendor.id}
            userId={userId}
            onSubmitted={handleReviewSubmitted}
          />
        )}
      </div>

      {/* ── Right: review list ── */}
      <div className="reviews-right">
        {loading ? (
          <div className="reviews-loading">Loading reviews…</div>
        ) : reviews.length === 0 ? (
          <div className="reviews-empty">
            <p>No reviews yet.</p>
            <p>Be the first GC to leave feedback on this vendor.</p>
          </div>
        ) : (
          <div className="review-list">
            {reviews.map(review => (
              <ReviewCard key={review.id} review={review} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ReviewCard({ review }) {
  const overall = CATEGORIES.reduce((acc, { key }) => acc + (parseFloat(review[key]) || 0), 0) / CATEGORIES.length;
  const date = new Date(review.created_at).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric'
  });

  return (
    <div className="review-card">
      <div className="review-card-header">
        <div className="review-card-meta">
          <span className="reviewer-name">{review.reviewer_name || 'Anonymous GC'}</span>
          <span className="review-date">{date}</span>
        </div>
        <div className="review-overall">
          <StarDisplay value={Math.round(overall)} size="sm" />
          <span className="review-overall-score">{overall.toFixed(1)}</span>
        </div>
      </div>

      <div className="review-categories">
        {CATEGORIES.map(({ key, label }) => (
          <div key={key} className="review-category-item">
            <span className="review-category-label">{label}</span>
            <StarDisplay value={review[key]} size="xs" />
          </div>
        ))}
      </div>

      {review.comment && (
        <p className="review-comment">"{review.comment}"</p>
      )}
    </div>
  );
}

// ── Inline ReviewForm (imported below) ─────────────────────────────────

function ReviewForm({ vendorId, userId, onSubmitted }) {
  const [ratings, setRatings] = useState({
    rating_reliability: 0,
    rating_cost: 0,
    rating_quality: 0,
    rating_communication: 0,
    rating_insurance: 0,
  });
  const [hovered, setHovered] = useState({});
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const unanswered = CATEGORIES.filter(({ key }) => !ratings[key]);
    if (unanswered.length > 0) {
      setError(`Please rate all categories before submitting.`);
      return;
    }

    if (!userId) {
      setError('You must be logged in to leave a review.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/vendors/${vendorId}/reviews`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token') || ''}`
        },
        body: JSON.stringify({ userId, comment, ...ratings })
      });
      const data = await res.json();
      if (data.success) {
        onSubmitted();
      } else {
        setError(data.error || 'Failed to submit review.');
      }
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form className="review-form" onSubmit={handleSubmit}>
      <h4 className="review-form-title">Rate this Vendor</h4>

      <div className="review-form-categories">
        {CATEGORIES.map(({ key, label }) => (
          <div key={key} className="review-form-row">
            <span className="review-form-label">{label}</span>
            <div className="star-input">
              {[1, 2, 3, 4, 5].map(star => (
                <button
                  key={star}
                  type="button"
                  className={`star-btn ${star <= (hovered[key] || ratings[key]) ? 'star-btn--active' : ''}`}
                  onMouseEnter={() => setHovered(h => ({ ...h, [key]: star }))}
                  onMouseLeave={() => setHovered(h => ({ ...h, [key]: 0 }))}
                  onClick={() => setRatings(r => ({ ...r, [key]: star }))}
                >
                  ★
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <textarea
        className="review-comment-input"
        placeholder="Share your experience working with this vendor (optional)…"
        value={comment}
        onChange={e => setComment(e.target.value)}
        rows={3}
        maxLength={1000}
      />

      {error && <p className="review-form-error">{error}</p>}

      <button
        type="submit"
        className="review-submit-btn"
        disabled={loading}
      >
        {loading ? 'Submitting…' : 'Submit Review'}
      </button>
    </form>
  );
}
