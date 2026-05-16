import React, { useState, useMemo } from 'react';
import { getSeverity, getStatusStyle, getTopPairs, getUniqueLayers } from './ClashParser';
import RFIModal from './RFIModal';
import '../styles/ClashAnalyzer.css';

const STATUS_TABS = ['All', 'Critical', 'New', 'Active', 'Reviewed', 'Resolved'];
const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

export default function ClashDashboard({ report, fileName, onReset }) {
  const { testName, summary, clashes } = report;

  const [activeTab, setActiveTab]       = useState('All');
  const [search, setSearch]             = useState('');
  const [layerFilter, setLayerFilter]   = useState('');
  const [expandedId, setExpandedId]     = useState(null);
  const [rfiClash, setRfiClash]         = useState(null);
  const [aiLoading, setAiLoading]       = useState(false);
  const [aiResult, setAiResult]         = useState('');
  const [aiError, setAiError]           = useState('');

  const layers   = useMemo(() => getUniqueLayers(clashes), [clashes]);
  const topPairs = useMemo(() => getTopPairs(clashes, 5), [clashes]);

  const filtered = useMemo(() => {
    let list = clashes;
    if (activeTab === 'Critical') list = list.filter(c => Math.abs(c.distance) >= 0.2);
    else if (activeTab === 'New')      list = list.filter(c => c.status === 'New');
    else if (activeTab === 'Active')   list = list.filter(c => c.status === 'Active');
    else if (activeTab === 'Reviewed') list = list.filter(c => c.status === 'Reviewed');
    else if (activeTab === 'Resolved') list = list.filter(c => ['Resolved', 'Approved'].includes(c.status));
    if (layerFilter) list = list.filter(c => c.item1.layer === layerFilter || c.item2.layer === layerFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(c =>
        [c.name, c.item1.itemName, c.item2.itemName, c.item1.layer, c.item2.layer, c.status]
          .join(' ').toLowerCase().includes(q)
      );
    }
    return list;
  }, [clashes, activeTab, layerFilter, search]);

  const handleAISummary = async () => {
    setAiLoading(true);
    setAiResult('');
    setAiError('');
    try {
      const topClashes = [...clashes]
        .sort((a, b) => a.distance - b.distance)
        .slice(0, 10)
        .map(c => `${c.name} (${c.status}): ${c.item1.itemName} vs ${c.item2.itemName} on ${c.item1.layer}, penetration ${c.distanceRaw}`);
      const res = await fetch(`${API_BASE_URL}/api/clash/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ summary, topClashes, testName }),
      });
      const data = await res.json();
      setAiResult(data.analysis || 'No analysis returned.');
    } catch {
      setAiError('AI analysis unavailable — check backend connection.');
    } finally {
      setAiLoading(false);
    }
  };

  const statCards = [
    { label: 'Total',    val: summary.total,    color: '#0E1B2C' },
    { label: 'New',      val: summary.New,      color: '#1D4ED8' },
    { label: 'Active',   val: summary.Active,   color: '#DC2626' },
    { label: 'Reviewed', val: summary.Reviewed, color: '#92400E' },
    { label: 'Approved', val: summary.Approved, color: '#166534' },
    { label: 'Resolved', val: summary.Resolved, color: '#475569' },
  ];

  return (
    <>
      {rfiClash && <RFIModal clash={rfiClash} onClose={() => setRfiClash(null)} />}

      <div className="clash-dashboard">

        <div className="clash-dash-header">
          <div>
            <h2 className="clash-dash-title">{testName}</h2>
            <p className="clash-dash-meta">{fileName} · Tolerance {summary.tolerance} · Type: {summary.type}</p>
          </div>
          <div className="clash-dash-actions">
            <button className="clash-btn-secondary" onClick={onReset}>↩ New Report</button>
            <button className="clash-btn-primary" onClick={handleAISummary} disabled={aiLoading}>
              {aiLoading ? 'Analyzing…' : '✦ AI Summary'}
            </button>
          </div>
        </div>

        {(aiResult || aiError) && (
          <div className={`clash-ai-result ${aiError ? 'error' : ''}`}>
            <div className="clash-ai-label">✦ AI Analysis</div>
            <p>{aiResult || aiError}</p>
          </div>
        )}

        <div className="clash-stat-grid">
          {statCards.map(s => (
            <div className="clash-stat-card" key={s.label}>
              <span className="clash-stat-label">{s.label}</span>
              <span className="clash-stat-val" style={{ color: s.color }}>{s.val}</span>
            </div>
          ))}
        </div>

        <div className="clash-charts-row">
          <div className="clash-chart-card">
            <p className="clash-chart-title">Top clashing element pairs</p>
            <div className="clash-pairs-list">
              {topPairs.map(({ pair, count, pct }) => (
                <div key={pair} className="clash-pair-item">
                  <div className="clash-pair-label-row">
                    <span className="clash-pair-label">{pair}</span>
                    <span className="clash-pair-count">{count}</span>
                  </div>
                  <div className="clash-pair-bar-bg">
                    <div className="clash-pair-bar-fill" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="clash-chart-card">
            <p className="clash-chart-title">Severity breakdown</p>
            <div className="clash-pairs-list">
              {[
                { label: 'Critical (≥ 0.5m)',  color: '#DC2626', count: clashes.filter(c => Math.abs(c.distance) >= 0.5).length },
                { label: 'High (0.2–0.5m)',    color: '#D97706', count: clashes.filter(c => { const d = Math.abs(c.distance); return d >= 0.2 && d < 0.5; }).length },
                { label: 'Medium (0.05–0.2m)', color: '#2563EB', count: clashes.filter(c => { const d = Math.abs(c.distance); return d >= 0.05 && d < 0.2; }).length },
                { label: 'Low (< 0.05m)',      color: '#475569', count: clashes.filter(c => Math.abs(c.distance) < 0.05).length },
              ].map(({ label, color, count }) => (
                <div key={label} className="clash-pair-item">
                  <div className="clash-pair-label-row">
                    <span className="clash-pair-label" style={{ color }}>{label}</span>
                    <span className="clash-pair-count">{count}</span>
                  </div>
                  <div className="clash-pair-bar-bg">
                    <div className="clash-pair-bar-fill" style={{ width: `${Math.round(count / clashes.length * 100)}%`, background: color }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="clash-filter-row">
          <div className="clash-tabs">
            {STATUS_TABS.map(tab => (
              <button
                key={tab}
                className={`clash-tab ${activeTab === tab ? 'active' : ''}`}
                onClick={() => setActiveTab(tab)}
              >
                {tab}
              </button>
            ))}
          </div>
          <div className="clash-filter-controls">
            <input
              type="text"
              className="clash-search"
              placeholder="Search element, layer, name…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            <select className="clash-select" value={layerFilter} onChange={e => setLayerFilter(e.target.value)}>
              <option value="">All layers</option>
              {layers.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
        </div>

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
                <th>RFI</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 100).map(clash => {
                const sev    = getSeverity(clash.distance);
                const sts    = getStatusStyle(clash.status);
                const isOpen = expandedId === clash.id;
                return (
                  <React.Fragment key={clash.id}>
                    <tr
                      className={`clash-row ${isOpen ? 'expanded' : ''}`}
                      onClick={() => setExpandedId(isOpen ? null : clash.id)}
                    >
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
                      <td onClick={e => e.stopPropagation()}>
                        <button className="clash-rfi-btn" onClick={() => setRfiClash(clash)}>
                          Draft RFI
                        </button>
                      </td>
                      <td className="clash-cell-expand">{isOpen ? '▲' : '▼'}</td>
                    </tr>

                    {isOpen && (
                      <tr className="clash-expand-row">
                        <td colSpan={9}>
                          <div className="clash-expand-content">
                            <div className="clash-expand-grid">
                              <div>
                                <p className="clash-expand-label">Element ID (1)</p>
                                <p className="clash-expand-val">{clash.item1.elementId}</p>
                              </div>
                              <div>
                                <p className="clash-expand-label">Element ID (2)</p>
                                <p className="clash-expand-val">{clash.item2.elementId}</p>
                              </div>
                              <div>
                                <p className="clash-expand-label">Layer (1)</p>
                                <p className="clash-expand-val">{clash.item1.layer}</p>
                              </div>
                              <div>
                                <p className="clash-expand-label">Layer (2)</p>
                                <p className="clash-expand-val">{clash.item2.layer}</p>
                              </div>
                              <div>
                                <p className="clash-expand-label">Clash point</p>
                                <p className="clash-expand-val">
                                  {clash.clashPoint.x !== null
                                    ? `${clash.clashPoint.x.toFixed(3)}, ${clash.clashPoint.y.toFixed(3)}, ${clash.clashPoint.z.toFixed(3)}`
                                    : '—'}
                                </p>
                              </div>
                              <div>
                                <p className="clash-expand-label">Date created</p>
                                <p className="clash-expand-val">{clash.dateCreated}</p>
                              </div>
                            </div>
                            <div className="clash-expand-actions">
                              <button
                                className="clash-btn-sm"
                                onClick={e => { e.stopPropagation(); setRfiClash(clash); }}
                              >
                                📋 Draft RFI
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
          <p className="clash-row-count">
            Showing {Math.min(filtered.length, 100)} of {filtered.length} clashes
            {filtered.length !== clashes.length && ` (${clashes.length} total)`}
          </p>
        </div>
      </div>
    </>
  );
}
