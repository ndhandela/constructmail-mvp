import React, { useState, useEffect, useCallback } from 'react';
import UploadPanel from '../components/UploadPanel';
import { API_BASE_URL, canReviewTrust } from '../trustUtils';
import '../styles/TrustQPRGenerator.css';

function currentFyQuarter() {
  const now = new Date();
  const month = now.getMonth() + 1; // 1-12
  const year = now.getFullYear();
  // Indian financial year: Apr-Mar. Q1=Apr-Jun ... Q4=Jan-Mar (of fyStartYear+1).
  if (month >= 4) {
    const q = Math.floor((month - 4) / 3) + 1;
    return `Q${q}-${year}`;
  }
  return `Q4-${year - 1}`;
}

function ExtractionsList({ userId, upload }) {
  const [expanded, setExpanded] = useState(false);
  const [extractions, setExtractions] = useState(null);

  const toggle = async () => {
    if (!expanded && extractions === null) {
      const res = await fetch(`${API_BASE_URL}/api/trust/uploads/${upload.id}/extractions?userId=${userId}`);
      const data = await res.json();
      if (data.success) setExtractions(data.extractions);
    }
    setExpanded((prev) => !prev);
  };

  return (
    <div className="trust-upload-row">
      <div className="trust-upload-row-header" onClick={toggle}>
        <span>{upload.upload_type === 'whatsapp' ? 'WhatsApp' : 'Email'} upload · {new Date(upload.uploaded_at).toLocaleString()}</span>
        <span className={`trust-status-pill trust-status-${upload.parse_status}`}>{upload.parse_status}</span>
        <span>{expanded ? '▼' : '▶'}</span>
      </div>
      {expanded && (
        <div className="trust-extractions">
          {extractions === null ? (
            <p className="trust-muted">Loading…</p>
          ) : extractions.length === 0 ? (
            <p className="trust-muted">No extractions.</p>
          ) : (
            extractions.map((ex) => (
              <div key={ex.id} className="trust-extraction-item">
                <span className={`trust-status-pill trust-status-${ex.extraction_type}`}>{ex.extraction_type.replace('_', ' ')}</span>
                <span>{ex.content_summary}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default function TrustQPRGenerator({ userId, project, trustRole }) {
  const [uploads, setUploads] = useState([]);
  const [quarter, setQuarter] = useState(currentFyQuarter());
  const [financials, setFinancials] = useState('{}');
  const [draft, setDraft] = useState(null);
  const [drafts, setDrafts] = useState([]);
  const [generating, setGenerating] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [error, setError] = useState('');

  const canReview = canReviewTrust(trustRole);

  const fetchUploads = useCallback(async () => {
    if (!project) return;
    const res = await fetch(`${API_BASE_URL}/api/trust/projects/${project.id}/uploads?userId=${userId}`);
    const data = await res.json();
    if (data.success) setUploads(data.uploads);
  }, [project, userId]);

  const fetchDrafts = useCallback(async () => {
    if (!project || !canReview) return;
    const res = await fetch(`${API_BASE_URL}/api/trust/projects/${project.id}/qpr-drafts?userId=${userId}`);
    const data = await res.json();
    if (data.success) setDrafts(data.drafts);
  }, [project, userId, canReview]);

  useEffect(() => { fetchUploads(); fetchDrafts(); }, [fetchUploads, fetchDrafts]);

  useEffect(() => {
    const existing = drafts.find((d) => d.quarter === quarter);
    setDraft(existing || null);
  }, [drafts, quarter]);

  if (!project) {
    return <p className="trust-muted">Select or create a project to get started.</p>;
  }

  const handleGenerate = async () => {
    setGenerating(true);
    setError('');
    try {
      let financialsObj = {};
      try { financialsObj = JSON.parse(financials || '{}'); } catch { /* leave as {} on bad JSON */ }
      const res = await fetch(`${API_BASE_URL}/api/trust/projects/${project.id}/qpr-draft?quarter=${encodeURIComponent(quarter)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: Number(userId), financials: financialsObj }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.detail || 'Could not generate draft.');
        return;
      }
      setDraft(data.draft);
      fetchDrafts();
    } catch (err) {
      setError('Network error. Try again.');
    } finally {
      setGenerating(false);
    }
  };

  const handleStatusChange = async (status) => {
    if (!draft) return;
    setSavingDraft(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/trust/projects/${project.id}/qpr-draft/${draft.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: Number(userId), status }),
      });
      const data = await res.json();
      if (data.success) {
        setDraft(data.draft);
        fetchDrafts();
      }
    } finally {
      setSavingDraft(false);
    }
  };

  const narrative = draft?.draft_json?.narrative_summary;
  const milestones = draft?.draft_json?.milestone_summary || [];

  return (
    <div className="trust-qpr-generator">
      <div className="trust-section-card">
        <h2>Upload site updates</h2>
        <UploadPanel userId={userId} projectId={project.id} onUploaded={fetchUploads} />
      </div>

      <div className="trust-section-card">
        <h2>Extraction summary</h2>
        {uploads.length === 0 ? (
          <p className="trust-muted">No uploads yet.</p>
        ) : (
          uploads.map((u) => <ExtractionsList key={u.id} userId={userId} upload={u} />)
        )}
      </div>

      {canReview ? (
        <div className="trust-section-card">
          <h2>QPR draft</h2>
          <div className="trust-form-row">
            <div className="trust-field">
              <label>Quarter (FY, e.g. Q3-2026)</label>
              <input value={quarter} onChange={(e) => setQuarter(e.target.value)} />
            </div>
            <div className="trust-field trust-field-wide">
              <label>Financial data (JSON)</label>
              <input value={financials} onChange={(e) => setFinancials(e.target.value)} placeholder='{"escrow_balance": 1200000}' />
            </div>
            <button className="trust-btn-primary" onClick={handleGenerate} disabled={generating || draft?.status === 'filed'}>
              {generating ? 'Generating…' : draft ? 'Regenerate draft' : 'Generate draft'}
            </button>
          </div>
          {error && <div className="trust-error">{error}</div>}

          {draft && (
            <div className="trust-qpr-draft">
              <div className="trust-qpr-draft-stats">
                <span>Physical progress: {draft.physical_progress_pct ?? '—'}%</span>
                <span>Financial progress: {draft.financial_progress_pct ?? '—'}%</span>
                <span>Due: {draft.due_date}</span>
                <span className={`trust-status-pill trust-status-${draft.status}`}>{draft.status}</span>
              </div>
              <p><strong>Escrow status:</strong> {draft.escrow_status}</p>
              {narrative && <p><strong>Narrative:</strong> {narrative}</p>}
              {milestones.length > 0 && (
                <ul>{milestones.map((m, i) => <li key={i}>{m}</li>)}</ul>
              )}
              <div className="trust-form-actions">
                <button
                  className="trust-btn-secondary"
                  onClick={() => handleStatusChange('reviewed')}
                  disabled={savingDraft || draft.status !== 'draft'}
                >
                  Mark as Reviewed
                </button>
                <button
                  className="trust-btn-primary"
                  onClick={() => handleStatusChange('filed')}
                  disabled={savingDraft || draft.status === 'filed'}
                  title={draft.status === 'filed' ? 'Already filed' : 'File this QPR (marks it filed in POMAR — actual filing happens on the RERA portal)'}
                >
                  Mark as Filed
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="trust-section-card">
          <h2>QPR draft</h2>
          <p className="trust-muted" title="Only a Compliance Reviewer or the GC Owner can generate, review, and file a QPR.">
            Ask your GC Owner or Compliance Reviewer to generate and file the QPR for this quarter.
          </p>
        </div>
      )}
    </div>
  );
}
