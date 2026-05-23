import React, { useState, useEffect } from 'react';
import '../styles/ClashAnalyzer.css';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

function getProjectKey(report) {
  const str = (report.test_name || '') + (report.total_clashes || '');
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

export default function ClashHome({ userId, onUploadNew, onLoadReport }) {
  const [reports, setReports]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    if (!userId) { setLoading(false); return; }
    fetch(`${API_BASE_URL}/api/clash/reports?userId=${userId}`)
      .then(r => r.json())
      .then(data => setReports(data.reports || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [userId]);

  const formatDate = (dateStr) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric'
    });
  };

  const getSeverityColor = (critical, high, total) => {
    if (!total) return 'var(--slate)';
    const pct = (critical + high) / total;
    if (pct > 0.5) return '#DC2626';
    if (pct > 0.2) return '#D97706';
    return '#166534';
  };

  return (
    <div className="clash-home">

      {/* ── Hero ── */}
      <div className="clash-home-hero">
        <div className="clash-uploader-badge">POMAR Clash · BIM Intelligence</div>
        <h1 className="clash-home-title">Navisworks Clash Analyzer</h1>
        <p className="clash-home-sub">
          Upload your Navisworks HTML clash report and get instant severity scoring,
          AI-drafted RFIs, week-over-week delta reports, and coordination meeting agendas.
        </p>
        <button className="clash-home-upload-btn" onClick={onUploadNew}>
          📄 Upload New Report
        </button>
      </div>

      {/* ── How it works ── */}
      <div className="clash-home-steps">
        <div className="clash-home-step">
          <div className="clash-home-step-num">1</div>
          <div>
            <p className="clash-home-step-title">Upload Report</p>
            <p className="clash-home-step-sub">Export HTML from Navisworks Clash Detective and upload</p>
          </div>
        </div>
        <div className="clash-home-step-arrow">→</div>
        <div className="clash-home-step">
          <div className="clash-home-step-num">2</div>
          <div>
            <p className="clash-home-step-title">Analyze & Assign</p>
            <p className="clash-home-step-sub">Severity scoring, AI RFI drafting, assign to disciplines</p>
          </div>
        </div>
        <div className="clash-home-step-arrow">→</div>
        <div className="clash-home-step">
          <div className="clash-home-step-num">3</div>
          <div>
            <p className="clash-home-step-title">Push & Export</p>
            <p className="clash-home-step-sub">Send RFIs to Procore, export PDF meeting agenda</p>
          </div>
        </div>
      </div>

      {/* ── Recent reports ── */}
      {loading ? (
        <div className="clash-home-loading">
          <div className="clash-spinner" />
          <span>Loading your reports…</span>
        </div>
      ) : reports.length === 0 ? (
        <div className="clash-home-empty">
          <p className="clash-home-empty-title">No reports yet</p>
          <p className="clash-home-empty-sub">Upload your first Navisworks clash report to get started.</p>
        </div>
      ) : (
        <div className="clash-home-reports">
          <p className="clash-home-section-label">Recent Reports</p>
          <div className="clash-home-report-grid">
            {reports.map(report => (
              <div
                key={report.id}
                className={`clash-home-report-card ${selected?.id === report.id ? 'selected' : ''}`}
                onClick={() => setSelected(selected?.id === report.id ? null : report)}
              >
                <div className="clash-home-report-header">
                  <div>
                    <p className="clash-home-report-name">{report.test_name}</p>
                    <p className="clash-home-report-file">{report.file_name}</p>
                  </div>
                  <span className="clash-home-report-date">{formatDate(report.created_at)}</span>
                </div>

                <div className="clash-home-report-stats">
                  <div className="clash-home-stat">
                    <span className="clash-home-stat-val" style={{ color: 'var(--inkwell)' }}>
                      {report.total_clashes}
                    </span>
                    <span className="clash-home-stat-label">Total</span>
                  </div>
                  <div className="clash-home-stat">
                    <span className="clash-home-stat-val" style={{ color: '#DC2626' }}>
                      {report.critical_clashes}
                    </span>
                    <span className="clash-home-stat-label">Critical</span>
                  </div>
                  <div className="clash-home-stat">
                    <span className="clash-home-stat-val" style={{ color: '#D97706' }}>
                      {report.high_clashes}
                    </span>
                    <span className="clash-home-stat-label">High</span>
                  </div>
                  <div className="clash-home-stat">
                    <span className="clash-home-stat-val" style={{ color: '#1D4ED8' }}>
                      {report.new_clashes}
                    </span>
                    <span className="clash-home-stat-label">New</span>
                  </div>
                </div>

                {/* Expanded actions */}
                {selected?.id === report.id && (
                  <div className="clash-home-report-actions" onClick={e => e.stopPropagation()}>
                    <button
                      className="clash-btn-primary"
                      style={{ fontSize: 12, padding: '6px 14px' }}
                      onClick={() => onUploadNew(report)}
                    >
                      🔄 Compare with new report
                    </button>
                    <button
                      className="clash-btn-secondary"
                      style={{ fontSize: 12, padding: '6px 14px' }}
                      onClick={() => onLoadReport(report)}
                    >
                      📊 View summary
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
