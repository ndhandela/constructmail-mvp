import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import '../styles/ConsentModal.css';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

// Minimal markdown-ish renderer for our own seeded legal_documents content
// (headers, **bold**, "- " lists, paragraphs) — not a general markdown
// engine, just enough for the placeholder ToS/Privacy text in db.py's
// _seed_legal_documents. Strips the leading HTML comment those documents
// carry ("PLACEHOLDER — NOT LAWYER REVIEWED...") so it's never shown here.
function renderMarkdownLite(markdown) {
  const withoutComments = (markdown || '').replace(/<!--[\s\S]*?-->/g, '');
  const renderInline = (text) =>
    text.split(/\*\*(.+?)\*\*/g).map((part, i) => (i % 2 === 1 ? <strong key={i}>{part}</strong> : part));

  const blocks = [];
  let list = null;
  const flushList = () => {
    if (list) {
      blocks.push(<ul key={`ul-${blocks.length}`}>{list}</ul>);
      list = null;
    }
  };

  withoutComments.split('\n').forEach((rawLine, idx) => {
    const line = rawLine.trim();
    if (!line) { flushList(); return; }
    if (line.startsWith('## ')) { flushList(); blocks.push(<h3 key={idx}>{renderInline(line.slice(3))}</h3>); return; }
    if (line.startsWith('# ')) { flushList(); blocks.push(<h2 key={idx}>{renderInline(line.slice(2))}</h2>); return; }
    if (line.startsWith('- ')) {
      if (!list) list = [];
      list.push(<li key={idx}>{renderInline(line.slice(2))}</li>);
      return;
    }
    flushList();
    blocks.push(<p key={idx}>{renderInline(line)}</p>);
  });
  flushList();
  return blocks;
}

// Blocks the app shell until the user accepts the current ToS + Privacy
// Policy version. Deliberately has no close button, no click-outside, and
// no Escape handler — unlike NewProjectModal.js's `dismissible` prop, this
// modal is never dismissible, since accepting is a hard requirement to use
// the Service. App.js renders this instead of any product route whenever
// user.consent_required is true (fresh login or a version bump discovered
// on refresh), so it's the only thing on screen until Accept succeeds.
export default function ConsentModal({ userId, onAccepted }) {
  const [documents, setDocuments] = useState(null);
  const [checked, setChecked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const loadDocuments = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE_URL}/api/legal/current`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Could not load Terms of Service / Privacy Policy');
      setDocuments(data);
    } catch (err) {
      console.error('Load legal documents error:', err);
      setError('Could not load the Terms of Service / Privacy Policy. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadDocuments(); }, []);

  const handleAccept = async () => {
    if (!checked || !documents) return;
    setSubmitting(true);
    setError('');
    try {
      for (const docType of ['tos', 'privacy']) {
        const res = await fetch(`${API_BASE_URL}/api/legal/accept`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: Number(userId), doc_type: docType, version: documents[docType].version }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Could not record your acceptance');
      }
      onAccepted();
    } catch (err) {
      console.error('Accept consent error:', err);
      setError(err.message || 'Could not record your acceptance. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return createPortal(
    <div className="consent-overlay">
      <div className="consent-modal" role="dialog" aria-modal="true" aria-label="Terms of Service and Privacy Policy">
        <div className="consent-header">
          <h3>Terms of Service &amp; Privacy Policy</h3>
          <p className="consent-subtitle">Please review and accept our updated terms to continue.</p>
        </div>

        <div className="consent-body">
          {loading && <p className="consent-loading">Loading…</p>}
          {error && !loading && !documents && <p className="consent-error">{error}</p>}
          {!loading && documents && (
            <>
              <section className="consent-doc">
                <h2>Terms of Service <span className="consent-version">v{documents.tos.version}</span></h2>
                {renderMarkdownLite(documents.tos.content)}
              </section>
              <section className="consent-doc">
                <h2>Privacy Policy <span className="consent-version">v{documents.privacy.version}</span></h2>
                {renderMarkdownLite(documents.privacy.content)}
              </section>
            </>
          )}
        </div>

        <div className="consent-footer">
          <label className="consent-checkbox-label">
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
              disabled={loading || !documents || submitting}
            />
            I have read and agree to the Terms of Service and Privacy Policy
          </label>
          {error && !loading && documents && <p className="consent-error">{error}</p>}
          <div className="consent-actions">
            {!documents && !loading && (
              <button type="button" className="consent-retry-btn" onClick={loadDocuments}>Retry</button>
            )}
            <button
              type="button"
              className="consent-accept-btn"
              disabled={!checked || submitting || loading || !documents}
              onClick={handleAccept}
            >
              {submitting ? 'Saving…' : 'Accept'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
