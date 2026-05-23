import React, { useState } from 'react';
import ClashUploader from '../components/ClashUploader';
import ClashDashboard from '../components/ClashDashboard';
import ClashDelta from '../components/ClashDelta';
import ClashAssignments from '../components/ClashAssignments';
import { parseNavisworksHTML } from '../components/ClashParser';
import '../styles/ClashAnalyzer.css';

const TABS = [
  { key: 'dashboard',   label: '📊 Dashboard' },
  { key: 'assignments', label: '📋 Assignments' },
  { key: 'delta',       label: '🔄 Delta Report' },
];

export default function ClashAnalyzer() {
  const [report, setReport]         = useState(null);
  const [fileName, setFileName]     = useState('');
  const [parseError, setParseError] = useState('');
  const [activeTab, setActiveTab]   = useState('dashboard');

  const userId = localStorage.getItem('constructmail_userId');

  const handleParsed = (htmlString, name) => {
    setParseError('');
    const result = parseNavisworksHTML(htmlString);
    if (result.parseErrors.length > 0 && result.clashes.length === 0) {
      setParseError(result.parseErrors[0]);
      return;
    }
    setFileName(name);
    setReport(result);
    setActiveTab('dashboard');
  };

  const handleReset = () => {
    setReport(null);
    setFileName('');
    setParseError('');
    setActiveTab('dashboard');
  };

  return (
    <main className="clash-page">
      {!report ? (
        <>
          <ClashUploader onParsed={handleParsed} />
          {parseError && (
            <div className="clash-parse-error">
              <strong>Parse error:</strong> {parseError}
            </div>
          )}
        </>
      ) : (
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
