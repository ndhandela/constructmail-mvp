import React, { useState, useMemo } from 'react';
import ClashUploader from './ClashUploader';
import { parseNavisworksHTML, getSeverity, getStatusStyle } from './ClashParser';
import '../styles/ClashAnalyzer.css';

// ── Compare two clash reports and return delta ────────────────────────────────
function computeDelta(current, previous) {
  const prevMap = {};
  previous.clashes.forEach(c => { prevMap[c.name] = c; });

  const currMap = {};
  current.clashes.forEach(c => { currMap[c.name] = c; });

  const newClashes      = current.clashes.filter(c => !prevMap[c.name]);
  const resolvedClashes = previous.clashes.filter(c =>
    !currMap[c.name] ||
    ['Resolved', 'Approved'].includes(currMap[c.name]?.status)
  );
  const stillOpen       = current.clashes.filter(c =>
    prevMap[c.name] &&
    !['Resolved', 'Approved'].includes(c.status)
  );
  const worsened        = current.clashes.filter(c => {
    const prev = prevMap[c.name];
    return prev && Math.abs(c.distance) > Math.abs(prev.distance) + 0.01;
  });

  return { newClashes, resolvedClashes, stillOpen, worsened };
}

export default function ClashDelta({ currentReport, currentFileName }) {
  const [prevReport, setPrevReport]   = useState(null);
  const [prevFileName, setPrevFileName] = useState('');
  const [parseError, setParseError]   = useState('');
  const [activeSection, setActiveSection] = useState('new');

  const handlePrevParsed = (htmlString, name) => {
    setParseError('');
    const result = parseNavisworksHTML(htmlString);
    if (result.parseErrors.length > 0 && result.clashes.length === 0) {
      setParseError(result.parseErrors[0]);
      return;
    }
    setPrevFileName(name);
    setPrevReport(result);
  };

  const delta = useMemo(() => {
    if (!prevReport) return null;
    return computeDelta(currentReport, prevReport);
  }, [currentReport, prevReport]);

  // ── Score card ──────────────────────────────────────────────────────────────
  const netChange = delta
    ? delta.newClashes.length - delta.resolvedClashes.length
    : null;

  const scoreColor = netChange === null ? 'var(--slate)'
    : netChange < 0 ? '#166534'
    : netChange > 0 ? '#DC2626'
    : '#D97706';

  const scoreLabel = netChange === null ? '—'
    : netChange < 0 ? `${Math.abs(netChange)} fewer clashes`
    : netChange > 0 ? `${netChange} more clashes`
    : 'No net change';

  return (
    <div className="clash-delta">

      {/* Upload previous report */}
      {!prevReport ? (
        <div className="clash-delta-upload">
          <div className="clash-delta-upload-header">
            <div className="clash-delta-badge">Compare Reports</div>
            <h2 className="clash-delta-title">Upload Previous Report</h2>
            <p className="clash-delta-sub">
              Upload last week's Navisworks HTML report to see what changed —
              new clashes, resolved items, and stale issues.
            </p>
            <div className="clash-delta-current-file">
              <span className="clash-delta-file-label">Current report:</span>
              <span className="clash-delta-file-name">{currentFileName}</span>
              <span className="clash-delta-file-count">{currentReport.summary.total} clashes</span>
            </div>
          </div>
          <ClashUploader onParsed={handlePrevParsed} />
          {parseError && <div className="clash-parse-error"><strong>Parse error:</strong> {parseError}</div>}
        </div>
      ) : (
        <div className="clash-delta-results">

          {/* Score cards */}
          <div className="clash-delta-score-row">
            <div className="clash-delta-score-card clash-delta-score-main">
              <p className="clash-delta-score-label">Net Change</p>
              <p className="clash-delta-score-val" style={{ color: scoreColor }}>
                {netChange !== null && netChange > 0 ? '+' : ''}{netChange}
              </p>
              <p className="clash-delta-score-sub" style={{ color: scoreColor }}>{scoreLabel}</p>
            </div>
            <div className="clash-delta-score-card">
              <p className="clash-delta-score-label">New</p>
              <p className="clash-delta-score-val" style={{ color: '#DC2626' }}>{delta.newClashes.length}</p>
              <p className="clash-delta-score-sub">clashes added</p>
            </div>
            <div className="clash-delta-score-card">
              <p className="clash-delta-score-label">Resolved</p>
              <p className="clash-delta-score-val" style={{ color: '#166534' }}>{delta.resolvedClashes.length}</p>
              <p className="clash-delta-score-sub">clashes closed</p>
            </div>
            <div className="clash-delta-score-card">
              <p className="clash-delta-score-label">Still Open</p>
              <p className="clash-delta-score-val" style={{ color: '#D97706' }}>{delta.stillOpen.length}</p>
              <p className="clash-delta-score-sub">unresolved</p>
            </div>
            <div className="clash-delta-score-card">
              <p className="clash-delta-score-label">Worsened</p>
              <p className="clash-delta-score-val" style={{ color: '#DC2626' }}>{delta.worsened.length}</p>
              <p className="clash-delta-score-sub">deeper penetration</p>
            </div>
          </div>

          {/* File comparison strip */}
          <div className="clash-delta-files-strip">
            <div className="clash-delta-file-chip clash-delta-file-prev">
              <span>Previous</span>
              <strong>{prevFileName}</strong>
              <span>{prevReport.summary.total} clashes</span>
            </div>
            <div className="clash-delta-arrow">→</div>
            <div className="clash-delta-file-chip clash-delta-file-curr">
              <span>Current</span>
              <strong>{currentFileName}</strong>
              <span>{currentReport.summary.total} clashes</span>
            </div>
            <button
              className="clash-btn-secondary"
              style={{ marginLeft: 'auto' }}
              onClick={() => { setPrevReport(null); setPrevFileName(''); }}
            >
              Change previous report
            </button>
          </div>

          {/* Section tabs */}
          <div className="clash-tabs" style={{ marginBottom: 12 }}>
            {[
              { key: 'new',      label: `New (${delta.newClashes.length})`,           color: '#DC2626' },
              { key: 'resolved', label: `Resolved (${delta.resolvedClashes.length})`, color: '#166534' },
              { key: 'open',     label: `Still Open (${delta.stillOpen.length})`,     color: '#D97706' },
              { key: 'worsened', label: `Worsened (${delta.worsened.length})`,        color: '#DC2626' },
            ].map(s => (
              <button
                key={s.key}
                className={`clash-tab ${activeSection === s.key ? 'active' : ''}`}
                onClick={() => setActiveSection(s.key)}
              >
                {s.label}
              </button>
            ))}
          </div>

          {/* Clash list */}
          <DeltaClashList
            clashes={
              activeSection === 'new'      ? delta.newClashes :
              activeSection === 'resolved' ? delta.resolvedClashes :
              activeSection === 'open'     ? delta.stillOpen :
              delta.worsened
            }
            type={activeSection}
            prevClashes={prevReport.clashes}
          />

        </div>
      )}
    </div>
  );
}

function DeltaClashList({ clashes, type, prevClashes }) {
  const prevMap = {};
  prevClashes.forEach(c => { prevMap[c.name] = c; });

  if (clashes.length === 0) {
    return (
      <div className="clash-delta-empty">
        <p>No clashes in this category 🎉</p>
      </div>
    );
  }

  return (
    <div className="clash-table-wrapper">
      <table className="clash-table">
        <thead>
          <tr>
            <th>Clash</th>
            <th>Status</th>
            <th>Severity</th>
            <th>Item 1</th>
            <th>Item 2</th>
            <th>Layer</th>
            <th>Penetration</th>
            {type === 'worsened' && <th>Change</th>}
          </tr>
        </thead>
        <tbody>
          {clashes.map(clash => {
            const sev = getSeverity(clash.distance);
            const sts = getStatusStyle(clash.status);
            const prev = prevMap[clash.name];
            const depthChange = prev
              ? (Math.abs(clash.distance) - Math.abs(prev.distance)).toFixed(3)
              : null;

            return (
              <tr key={clash.id} className="clash-row">
                <td className="clash-cell-name">{clash.name}</td>
                <td>
                  <span className="clash-badge" style={{ background: sts.bg, color: sts.text }}>
                    {clash.status}
                  </span>
                </td>
                <td>
                  <span className="clash-sev-label" style={{ color: sev.color }}>{sev.label}</span>
                  <div className="clash-sev-bar-bg">
                    <div className="clash-sev-bar-fill" style={{ width: `${sev.barWidth}%`, background: sev.color }} />
                  </div>
                </td>
                <td className="clash-cell-item" title={clash.item1.itemName}>{clash.item1.itemName}</td>
                <td className="clash-cell-item" title={clash.item2.itemName}>{clash.item2.itemName}</td>
                <td className="clash-cell-layer">{clash.item1.layer}</td>
                <td className="clash-cell-dist" style={{ color: sev.color }}>{clash.distanceRaw}</td>
                {type === 'worsened' && (
                  <td style={{ color: '#DC2626', fontWeight: 600, whiteSpace: 'nowrap' }}>
                    +{depthChange}m deeper
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="clash-row-count">
        {clashes.length} clash{clashes.length !== 1 ? 'es' : ''}
      </p>
    </div>
  );
}
