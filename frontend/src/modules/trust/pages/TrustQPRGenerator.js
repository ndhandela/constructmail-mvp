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

// The persistent reminder required on every TG form tab — these are prefill
// aids for the certifying professionals, never a filing POMAR makes itself.
function DraftDisclaimerBanner() {
  return (
    <div className="trust-draft-banner">
      These are draft summaries to support your architect, engineer, and CA — not certified filings.
      Certification and submission happen on the TG-RERA portal.
    </div>
  );
}

function DownloadButton({ projectId, draftId, userId, form, label }) {
  return (
    <a
      className="trust-btn-secondary trust-download-btn"
      href={`${API_BASE_URL}/api/trust/projects/${projectId}/qpr-draft/${draftId}/export?form=${form}&userId=${userId}`}
    >
      {label}
    </a>
  );
}

function Form1View({ projectId, draft, userId }) {
  const data = draft.draft_json?.form1_architect_draft;
  if (!data) return <p className="trust-muted">No Form-1 data in this draft.</p>;
  return (
    <div>
      <p><strong>Overall completion:</strong> {data.overall_completion_pct ?? '—'}%</p>
      {(data.buildings || []).map((b, i) => (
        <div key={i} className="trust-form1-building">
          <div className="trust-form1-building-header">
            <strong>{b.name}</strong> — {b.completion_pct ?? '—'}%
            <span className="trust-muted"> as of {b.as_of_date || 'unspecified date'}</span>
          </div>
          {(b.supporting_notes || []).length > 0 && (
            <ul>{b.supporting_notes.map((n, j) => <li key={j}>{n}</li>)}</ul>
          )}
        </div>
      ))}
      <DownloadButton projectId={projectId} draftId={draft.id} userId={userId} form={1} label="Download draft PDF" />
    </div>
  );
}

// Deliberately reads as a neutral, timestamped reference log — never a report
// with conclusions. No styling here implies an assessment of quality/quantity.
function Form2View({ projectId, draft, userId }) {
  const data = draft.draft_json?.form2_engineer_draft;
  if (!data) return <p className="trust-muted">No Form-2 data in this draft.</p>;
  return (
    <div>
      <p className="trust-form2-note">{data.note}</p>
      <div className="trust-milestone-log">
        {(data.milestone_log || []).length === 0 ? (
          <p className="trust-muted">No milestone entries this quarter.</p>
        ) : (
          data.milestone_log.map((entry, i) => (
            <div key={i} className="trust-milestone-log-entry">
              <span className="trust-mono">{entry.date}</span>
              <span>{entry.description}</span>
              <span className="trust-muted trust-milestone-source">{entry.source}</span>
            </div>
          ))
        )}
      </div>
      <DownloadButton projectId={projectId} draftId={draft.id} userId={userId} form={2} label="Download draft PDF" />
    </div>
  );
}

function Form3View({ projectId, draft, userId }) {
  const data = draft.draft_json?.form3_ca_draft;
  if (!data) return <p className="trust-muted">No Form-3 data in this draft.</p>;
  return (
    <div>
      <p><strong>Financial progress:</strong> {data.financial_progress_pct ?? 'not available'}%</p>
      <p><strong>Financial data provided:</strong> {data.escrow_data_provided ? 'Yes' : 'No'}</p>
      <p><strong>Escrow status:</strong> {data.escrow_narrative}</p>
      {data.withdrawal_vs_completion_note && (
        <p><strong>Withdrawal vs. completion:</strong> {data.withdrawal_vs_completion_note}</p>
      )}
      <DownloadButton projectId={projectId} draftId={draft.id} userId={userId} form={3} label="Download draft PDF" />
    </div>
  );
}

const FORM_TABS = [
  { key: 'form1', label: 'Form-1 — Architect Draft', View: Form1View },
  { key: 'form2', label: 'Form-2 — Engineer Reference Log', View: Form2View },
  { key: 'form3', label: 'Form-3 — CA Draft', View: Form3View },
];

export default function TrustQPRGenerator({ userId, project, trustRole, stateProfiles }) {
  const [uploads, setUploads] = useState([]);
  const [quarter, setQuarter] = useState(currentFyQuarter());
  const [financials, setFinancials] = useState('{}');
  const [draft, setDraft] = useState(null);
  const [drafts, setDrafts] = useState([]);
  const [generating, setGenerating] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [error, setError] = useState('');
  const [notSupportedMessage, setNotSupportedMessage] = useState('');
  const [activeForm, setActiveForm] = useState('form1');

  const canReview = canReviewTrust(trustRole);
  const stateProfile = project ? stateProfiles.find((s) => s.code === project.rera_state) : null;
  const stateImplemented = !!stateProfile?.implemented;

  const fetchUploads = useCallback(async () => {
    if (!project) return;
    const res = await fetch(`${API_BASE_URL}/api/trust/projects/${project.id}/uploads?userId=${userId}`);
    const data = await res.json();
    if (data.success) setUploads(data.uploads);
  }, [project, userId]);

  const fetchDrafts = useCallback(async () => {
    if (!project || !canReview || !stateImplemented) return;
    const res = await fetch(`${API_BASE_URL}/api/trust/projects/${project.id}/qpr-drafts?userId=${userId}`);
    const data = await res.json();
    if (data.success) setDrafts(data.drafts);
  }, [project, userId, canReview, stateImplemented]);

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
    setNotSupportedMessage('');
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
      if (data.supported === false) {
        setNotSupportedMessage(data.message);
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

  const ActiveFormView = FORM_TABS.find((t) => t.key === activeForm).View;

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

      {!canReview ? (
        <div className="trust-section-card">
          <h2>QPR draft</h2>
          <p className="trust-muted" title="Only a Compliance Reviewer or the GC Owner can generate, review, and file a QPR.">
            Ask your GC Owner or Compliance Reviewer to generate and file the QPR for this quarter.
          </p>
        </div>
      ) : !stateProfile ? (
        <div className="trust-section-card">
          <p className="trust-muted">Loading state requirements…</p>
        </div>
      ) : !stateImplemented ? (
        <div className="trust-section-card">
          <h2>QPR draft</h2>
          <div className="trust-notice">
            QPR generation for {stateProfile.label} isn't available yet. We currently support TG-RERA.
          </div>
          <p className="trust-muted" style={{ marginTop: 12 }}>
            Uploads, extractions, Change Alerts, and Audit Trail all still work for this project — only
            structured QPR draft generation is state-specific.
          </p>
        </div>
      ) : (
        <div className="trust-section-card">
          <h2>QPR draft — TG-RERA</h2>
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
          {notSupportedMessage && <div className="trust-notice">{notSupportedMessage}</div>}

          {draft && (
            <div className="trust-qpr-draft">
              <DraftDisclaimerBanner />
              <div className="trust-qpr-draft-stats">
                <span>Physical progress: {draft.physical_progress_pct ?? '—'}%</span>
                <span>Financial progress: {draft.financial_progress_pct ?? '—'}%</span>
                <span>Due: {draft.due_date}</span>
                <span className={`trust-status-pill trust-status-${draft.status}`}>{draft.status}</span>
              </div>

              <div className="trust-form-tabs">
                {FORM_TABS.map((tab) => (
                  <button
                    key={tab.key}
                    className={`trust-form-tab ${activeForm === tab.key ? 'active' : ''}`}
                    onClick={() => setActiveForm(tab.key)}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              <ActiveFormView projectId={project.id} draft={draft} userId={userId} />

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
                  title={draft.status === 'filed' ? 'Already filed' : 'Mark this QPR filed in POMAR once all three forms have been certified and filed on the TG-RERA portal by the respective professionals'}
                >
                  Mark as Filed
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
