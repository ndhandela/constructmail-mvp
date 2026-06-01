import React, { useState } from 'react';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

export default function MarketplaceReviewForm({ listingId, userId, onReviewSubmitted }) {
  const [rating, setRating] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!rating) { setMessage({ type: 'error', text: 'Please select a rating.' }); return; }
    setSubmitting(true);
    setMessage(null);
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/marketplace/listings/${listingId}/reviews?userId=${userId}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rating, comment }),
        }
      );
      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: 'Review submitted!' });
        setRating(0);
        setComment('');
        if (onReviewSubmitted) onReviewSubmitted(data.review);
      } else {
        setMessage({ type: 'error', text: data.detail || 'Could not submit review.' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Network error. Try again.' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mp-review-form">
      <h4>Leave a Review</h4>
      <form onSubmit={handleSubmit}>
        <div className="mp-star-selector">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              type="button"
              className={`mp-star-btn ${star <= (hovered || rating) ? 'selected' : ''}`}
              onMouseEnter={() => setHovered(star)}
              onMouseLeave={() => setHovered(0)}
              onClick={() => setRating(star)}
              aria-label={`${star} star`}
            >
              ★
            </button>
          ))}
        </div>
        <textarea
          className="mp-review-textarea"
          placeholder="Share your experience (optional)"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={3}
        />
        <button
          type="submit"
          className="mp-submit-review-btn"
          disabled={submitting}
        >
          {submitting ? 'Submitting…' : 'Submit Review'}
        </button>
        {message && (
          <div className={`mp-form-msg ${message.type}`}>{message.text}</div>
        )}
      </form>
    </div>
  );
}
