import React, { useState } from 'react';
import { API_BASE_URL } from '../trustUtils';

export default function NoticeReviewModal({ userId, alert, draftContent, onClose, onSent }) {
  const [content, setContent] = useState(draftContent);
  const [unitReference, setUnitReference] = useState('');
  const [proofReference, setProofReference] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const handleSend = async () => {
    if (!proofReference.trim()) {
      setError('Paste a proof reference (screenshot filename, WhatsApp message ID, etc.) — the notice is sent through your own channel, not by POMAR.');
      return;
    }
    setSending(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE_URL}/api/trust/alerts/${alert.id}/send-notice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: Number(userId),
          unit_reference: unitReference.trim(),
          content,
          proof_reference: proofReference.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.detail || 'Could not record the sent notice.');
        return;
      }
      onSent();
    } catch (err) {
      setError('Network error. Try again.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="trust-modal-overlay" onClick={onClose}>
      <div className="trust-modal" onClick={(e) => e.stopPropagation()}>
        <h3>Review buyer disclosure notice</h3>
        <p className="trust-muted">
          POMAR never sends this for you — send it through your own channel (email/WhatsApp/portal), then paste back proof it went out.
        </p>
        <div className="trust-field">
          <label>Unit reference</label>
          <input value={unitReference} onChange={(e) => setUnitReference(e.target.value)} placeholder="e.g. Tower B, Unit 402" />
        </div>
        <div className="trust-field">
          <label>Notice content</label>
          <textarea rows={8} value={content} onChange={(e) => setContent(e.target.value)} />
        </div>
        <div className="trust-field">
          <label>Proof of send</label>
          <input
            value={proofReference}
            onChange={(e) => setProofReference(e.target.value)}
            placeholder="Screenshot filename, WhatsApp message ID, email Message-ID, etc."
          />
        </div>
        {error && <div className="trust-error">{error}</div>}
        <div className="trust-form-actions">
          <button className="trust-btn-secondary" onClick={onClose} disabled={sending}>Cancel</button>
          <button className="trust-btn-primary" onClick={handleSend} disabled={sending}>
            {sending ? 'Saving…' : 'Mark as Sent'}
          </button>
        </div>
      </div>
    </div>
  );
}
