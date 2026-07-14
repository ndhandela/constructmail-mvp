import React, { useState, useContext } from 'react';
import ClashHome from '../components/ClashHome';
import ClashUploader from '../components/ClashUploader';
import ClashDashboard from '../components/ClashDashboard';
import ClashDelta from '../components/ClashDelta';
import ClashAssignments from '../components/ClashAssignments';
import { parseNavisworksHTML } from '../components/ClashParser';
import { ProjectContext, ALL_PROJECTS } from '../../../contexts/ProjectContext';
import '../styles/ClashAnalyzer.css';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

const TABS = [
  { key: 'dashboard',   label: '📊 Dashboard' },
  { key: 'assignments', label: '📋 Assignments' },
  { key: 'delta',       label: '🔄 Delta Report' },
];

function getProjectKey(report) {
  const str = (report.testName || '') + (report.summary?.total || '');
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

export default function ClashAnalyzer() {
  const [screen, setScreen]         = useState('home');  // home | upload | report
  const [report, setReport]         = useState(null);
  const [fileName, setFileName]     = useState('');
  const [parseError, setParseError] = useState('');
  const [activeTab, setActiveTab]   = useState('dashboard');

  const userId = localStorage.getItem('constructmail_userId');
  // Named distinctly from ProcoreConnect.js's `projectId` (a Procore remote
  // project id used for RFI push) — this is the POMAR project from the Header switcher.
  const { currentProjectId: pomarProjectId } = useContext(ProjectContext);

  const saveReportHistory = async (result, name) => {
    if (!userId) return;
    const critical = result.clashes.filter(c => Math.abs(c.distance) >= 0.5).length;
    const high     = result.clashes.filter(c => { const d = Math.abs(c.distance); return d >= 0.2 && d < 0.5; }).length;
    try {
      await fetch(`${API_BASE_URL}/api/clash/reports`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          testName:   result.testName,
          fileName:   name,
          projectKey: getProjectKey(result),
          projectId:  pomarProjectId !== ALL_PROJECTS ? pomarProjectId : undefined,
          summary: {
            total:    result.summary.total,
            New:      result.summary.New,
            Active:   result.summary.Active,
            Reviewed: result.summary.Reviewed,
            Critical: critical,
            High:     high,
          },
        }),
      });
    } catch (err) {
      console.error('Save report history error:', err);
    }
  };

  const handleParsed = async (htmlString, name) => {
    setParseError('');
    const result = parseNavisworksHTML(htmlString);
    if (result.parseErrors.length > 0 && result.clashes.length === 0) {
      setParseError(result.parseErrors[0]);
      return;
    }
    setFileName(name);
    setReport(result);
    await saveReportHistory(result, name);
    setScreen('report');
    setActiveTab('dashboard');
  };

  const handleReset = () => {
    setReport(null);
    setFileName('');
    setParseError('');
    setScreen('home');
    setActiveTab('dashboard');
  };

  // From home — upload new (optionally with a preloaded previous report for delta)
  const handleUploadNew = (previousReport = null) => {
    setScreen('upload');
  };

  // From home — view summary of a past report (read-only stats)
  const handleLoadReport = (historicalReport) => {
    // Show a summary modal or just go to upload
    // For now navigate to upload with context
    setScreen('upload');
  };

  return (
    <main className="clash-page">

      {/* ── Connect link ── */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '12px 24px 0' }}>
        <a href="/connect" style={{ textDecoration: 'none' }}>
          <button style={{ background: '#D97706', color: '#fff', border: 'none', padding: '7px 14px', borderRadius: '8px', fontWeight: '600', fontSize: '0.82rem', cursor: 'pointer' }}>
            ⚡ Connect
          </button>
        </a>
      </div>

      {/* ── Home screen ── */}
      {screen === 'home' && (
        <ClashHome
          userId={userId}
          onUploadNew={handleUploadNew}
          onLoadReport={handleLoadReport}
        />
      )}

      {/* ── Upload screen ── */}
      {screen === 'upload' && (
        <div>
          <div className="clash-home-back">
            <button className="clash-btn-secondary" onClick={() => setScreen('home')}>
              ← Back
            </button>
          </div>
          <ClashUploader onParsed={handleParsed} />
          {parseError && (
            <div className="clash-parse-error">
              <strong>Parse error:</strong> {parseError}
            </div>
          )}
        </div>
      )}

      {/* ── Report screen ── */}
      {screen === 'report' && report && (
        <>
          <div className="clash-module-tabs">
            {TABS.map(tab => (
              <button
                key={tab.key}
                className={`clash-module-tab ${activeTab === tab.key ? 'active' : ''}`}
                onClick={() => setActiveTab(tab.key)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {activeTab === 'dashboard' && (
            <ClashDashboard
              report={report}
              fileName={fileName}
              onReset={handleReset}
            />
          )}

          {activeTab === 'assignments' && (
            <ClashAssignments
              report={report}
              fileName={fileName}
              userId={userId}
            />
          )}

          {activeTab === 'delta' && (
            <ClashDelta
              currentReport={report}
              currentFileName={fileName}
            />
          )}
        </>
      )}

    </main>
  );
}
