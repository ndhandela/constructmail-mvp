import React, { useState, useEffect, useCallback } from 'react';
import { getSeverity } from './ClashParser';
import '../styles/ClashAnalyzer.css';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

const ASSIGNEES = [
  'MEP Subcontractor',
  'Structural Engineer',
  'Architect',
  'GC to Resolve',
  'Owner',
  'Civil Engineer',
  'Unassigned',
];

const DISCIPLINES = [
  'Mechanical',
  'Plumbing',
  'Electrical',
  'Structural',
  'Architectural',
  'Civil',
  'General',
];

const STATUS_OPTIONS = [
  { value: 'open',        label: 'Open',        color: '#DC2626' },
  { value: 'in_progress', label: 'In Progress',  color: '#D97706' },
  { value: 'resolved',    label: 'Resolved',     color: '#166534' },
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

export default function ClashAssignments({ report, fileName, userId }) {
  const [assignments, setAssignments]       = useState({});
  const [loading, setLoading]               = useState(true);
  const [saving, setSaving]                 = useState({});
  const [exporting, setExporting]           = useState(false);
  const [search, setSearch]                 = useState('');
  const [filterAssignee, setFilterAssignee] = useState('');
  const [filterStatus, setFilterStatus]     = useState('');

  const projectKey = getProjectKey(report);

  useEffect(() => {
    if (!userId) { setLoading(false); return; }
    fetch(`${API_BASE_URL}/api/clash/assignments?userId=${userId}&projectKey=${projectKey}`)
      .then(r => r.json())
      .then(data => {
        const map = {};
        (data.assignments || []).forEach(a => { map[a.clash_name] = a; });
        setAssignments(map);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, projectKey]);

  const saveAssignment = useCallback(async (clashName, field, value) => {
    const current = assignments[clashName] || {};
    const updated = { ...current, [field]: value };
    setAssignments(prev => ({ ...prev, [clashName]: { ...prev[clashName], [field]: value } }));
    setSaving(prev => ({ ...prev, [clashName]: true }));
    try {
      await fetch(`${API_BASE_URL}/api/clash/assignments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          projectKey,
          clashName,
          assignedTo: updated.assigned_to || null,
          discipline: updated.discipline  || null,
          notes:      updated.notes       || null,
          status:     updated.status      || 'open',
        }),
      });
    } catch (err) {
      console.error('Save error:', err);
    } finally {
      setSaving(prev => ({ ...prev, [clashName]: false }));
    }
  }, [assignments, userId, projectKey]);

  const handleExportPDF = async () => {
    setExporting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/clash/agenda-pdf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          projectKey,
          testName:    report.testName,
          fileName,
          clashes:     report.clashes.map(c => ({ name: c.name, distance: c.distance, distanceRaw: c.distanceRaw, item1: { itemName: c.item1.itemName }, item2: { itemName: c.item2.itemName } })),
          assignments: Object.values(assignments),
        }),
      });
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `POMAR-Clash-Agenda-${new Date().toISOString().split('T')[0]}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('PDF export error:', err);
    } finally {
      setExporting(false);
    }
  };

  const filtered = report.clashes.filter(c => {
    const a = assignments[c.name];
    if (search && ![c.name, c.item1?.itemName, c.item2?.itemName].join(' ').toLowerCase().includes(search.toLowerCase())) return false;
    if (filterAssignee && (a?.assigned_to !== filterAssignee)) return false;
    if (filterStatus && (a?.status || 'open') !== filterStatus) return false;
    return true;
  });

  const assignedCount   = report.clashes.filter(c => assignments[c.name]?.assigned_to).length;
  const unassignedCount = report.clashes.length - assignedCount;
  const resolvedCount   = report.clashes.filter(c => assignments[c.name]?.status === 'resolved').length;

  if (loading) return (
    <div className="clash-assignments-loading">
      <div className="clash-spinner" />
      <span>Loading assignments…</span>
    </div>
  );

  return (
    <div className="clash-assignments">

      <div className="clash-dash-header">
        <div>
          <h2 className="clash-dash-title">Coordination Assignment Table</h2>
          <p className="clash-dash-meta">
            {report.testName} · {assignedCount} assigned · {unassignedCount} unassigned · {resolvedCount} resolved
          </p>
        </div>
        <button className="clash-btn-primary" onClick={handleExportPDF} disabled={exporting}>
          {exporting ? 'Generating PDF…' : '📄 Export Meeting Agenda'}
        </button>
      </div>

      <div className="ca-progress-wrap">
        <div className="ca-progress-bar">
          <div
            className="ca-progress-fill"
            style={{ width: `${Math.round(assignedCount / report.clashes.length * 100)}%` }}
          />
        </div>
        <span className="ca-progress-label">
          {Math.round(assignedCount / report.clashes.length * 100)}% assigned
        </span>
      </div>

      <div className="clash-filter-row">
        <div className="clash-filter-controls">
          <input
            type="text"
            className="clash-search"
            placeholder="Search clash or element…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <select className="clash-select" value={filterAssignee} onChange={e => setFilterAssignee(e.target.value)}>
            <option value="">All assignees</option>
            {ASSIGNEES.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <select className="clash-select" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            <option value="">All statuses</option>
            {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
      </div>

      <div className="clash-table-wrapper">
        <table className="clash-table ca-table">
          <thead>
            <tr>
              <th>Clash</th>
              <th>Severity</th>
              <th>Item 1</th>
              <th>Item 2</th>
              <th>Penetration</th>
              <th>Assigned To</th>
              <th>Discipline</th>
              <th>Status</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(clash => {
              const sev      = getSeverity(clash.distance);
              const a        = assignments[clash.name] || {};
              const isSaving = saving[clash.name];

              return (
                <tr key={clash.id} className={`clash-row ${isSaving ? 'ca-saving' : ''}`}>
                  <td className="clash-cell-name">{clash.name}</td>
                  <td>
                    <span className="clash-sev-label" style={{ color: sev.color }}>{sev.label}</span>
                    <div className="clash-sev-bar-bg">
                      <div className="clash-sev-bar-fill" style={{ width: `${sev.barWidth}%`, background: sev.color }} />
                    </div>
                  </td>
                  <td className="clash-cell-item" title={clash.item1?.itemName}>{clash.item1?.itemName}</td>
                  <td className="clash-cell-item" title={clash.item2?.itemName}>{clash.item2?.itemName}</td>
                  <td className="clash-cell-dist" style={{ color: sev.color }}>{clash.distanceRaw}</td>
                  <td>
                    <select className="ca-select" value={a.assigned_to || ''} onChange={e => saveAssignment(clash.name, 'assigned_to', e.target.value)}>
                      <option value="">— Assign —</option>
                      {ASSIGNEES.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  </td>
                  <td>
                    <select className="ca-select" value={a.discipline || ''} onChange={e => saveAssignment(clash.name, 'discipline', e.target.value)}>
                      <option value="">— Discipline —</option>
                      {DISCIPLINES.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  </td>
                  <td>
                    <select
                      className="ca-select"
                      value={a.status || 'open'}
                      onChange={e => saveAssignment(clash.name, 'status', e.target.value)}
                      style={{ color: STATUS_OPTIONS.find(s => s.value === (a.status || 'open'))?.color }}
                    >
                      {STATUS_OPTIONS.map(s => (
                        <option key={s.value} value={s.value} style={{ color: s.color }}>{s.label}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      type="text"
                      className="ca-notes-input"
                      placeholder="Add notes…"
                      value={a.notes || ''}
                      onChange={e => setAssignments(prev => ({
                        ...prev,
                        [clash.name]: { ...prev[clash.name], notes: e.target.value }
                      }))}
                      onBlur={e => saveAssignment(clash.name, 'notes', e.target.value)}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="clash-row-count">Showing {filtered.length} of {report.clashes.length} clashes</p>
      </div>
    </div>
  );
}
