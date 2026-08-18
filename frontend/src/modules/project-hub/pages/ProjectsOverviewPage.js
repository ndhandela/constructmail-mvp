import React, { useContext, useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell,
  RadialBarChart, RadialBar,
} from 'recharts';
import { ProjectContext } from '../../../contexts/ProjectContext';
import { isModuleLocked } from '../../../components/ModuleLockedNotice';
import { API_BASE_URL, formatCurrency } from '../../capital/capitalUtils';
import '../styles/ProjectHub.css';

const CHECK_ICON = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const WARN_ICON = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 9v4M12 17h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
  </svg>
);

// Single presentation-layer mapping onto routers/dashboard.py's
// classify_project_risk() output — the risk *classification* itself only
// exists once, server-side, so this and the comparison chart below always
// agree with each other and with every card's pill/donut by construction.
const RISK = {
  on_track: { label: 'On track', color: 'var(--green)', bg: 'var(--green-bg)' },
  at_risk: { label: 'At risk', color: 'var(--saffron)', bg: 'var(--saffron-soft)' },
  over_budget: { label: 'Over budget', color: 'var(--brick)', bg: '#FDECEA' },
};
const riskInfo = (status) => RISK[status] || { label: '—', color: 'var(--slate)', bg: 'var(--border-light)' };

const STALE_LOG_MS = 3 * 24 * 60 * 60 * 1000;

function formatDueDate(dateStr) {
  if (!dateStr) return null;
  const d = new Date(`${dateStr}T00:00:00`);
  const opts = { month: 'short', day: 'numeric' };
  if (d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
  return d.toLocaleDateString('en-US', opts);
}

function formatLogTimestamp(iso) {
  const d = new Date(iso);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfLogDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dayDiff = Math.round((startOfToday - startOfLogDay) / 86400000);
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  if (dayDiff <= 0) return `Today, ${time}`;
  if (dayDiff === 1) return `Yesterday, ${time}`;
  return `${dayDiff} days ago`;
}

// signal is null when the module isn't enabled for the caller's company
// (routers/capital.py's list_capital_projects) — shown as a neutral, unlit
// row rather than hidden, so the card's shape stays consistent across
// projects/companies with different modules turned on.
function SignalRow({ label, signal, warnStatuses }) {
  const isNeutral = !signal;
  const isWarn = signal && warnStatuses.includes(signal.status);
  const tone = isNeutral ? 'neutral' : isWarn ? 'warn' : 'ok';

  return (
    <div className={`ph-signal-row ph-signal-${tone}`}>
      <span className="ph-signal-icon">{isNeutral ? '—' : isWarn ? WARN_ICON : CHECK_ICON}</span>
      <span className="ph-signal-label">{label}</span>
      <span className="ph-signal-text">{isNeutral ? 'Not enabled' : signal.label}</span>
    </div>
  );
}

// Donut showing % of budget spent, with the actual number centered inside
// the ring (recharts has no built-in center label, so this overlays one).
function BudgetDonut({ spentPct, risk }) {
  const pct = spentPct ?? 0;
  const { color } = riskInfo(risk);
  const data = [{ value: Math.min(Math.max(pct, 0), 100) }];

  return (
    <div className="ph-donut">
      <ResponsiveContainer width={64} height={64}>
        <RadialBarChart
          width={64}
          height={64}
          data={data}
          innerRadius="72%"
          outerRadius="100%"
          startAngle={90}
          endAngle={-270}
          barSize={7}
        >
          <RadialBar dataKey="value" cornerRadius={6} fill={color} background={{ fill: 'var(--border-light)' }} isAnimationActive={false} />
        </RadialBarChart>
      </ResponsiveContainer>
      <span className="ph-donut-label">{spentPct === null ? '—' : `${Math.round(pct)}%`}</span>
    </div>
  );
}

function ProjectCard({ project, summary, dash, loading, onOpen }) {
  const budgeted = Number(dash?.budget_total) || 0;
  const actual = Number(dash?.budget_spent) || 0;
  const spentPct = dash?.budget_spent_pct ?? null;
  const risk = dash?.risk_status;
  const { label: riskLabel, color: riskColor, bg: riskBg } = riskInfo(risk);

  const milestone = dash?.next_milestone;
  const milestoneWarn = milestone?.overdue;

  const lastLog = dash?.last_log;
  const logStale = lastLog && (Date.now() - new Date(lastLog.logged_at).getTime()) > STALE_LOG_MS;

  return (
    <div className="ph-overview-card" onClick={onOpen}>
      <div className="ph-overview-card-header">
        <div>
          <h3 className="ph-overview-card-title">{project.name}</h3>
          {dash?.phase_label && <p className="ph-overview-phase">{dash.phase_label}</p>}
        </div>
        {dash && (
          <span className="ph-status-pill" style={{ background: riskBg, color: riskColor }}>
            {riskLabel}
          </span>
        )}
      </div>

      {loading ? (
        <p className="ph-muted">Loading…</p>
      ) : (
        <>
          <div className="ph-overview-budget-row">
            <BudgetDonut spentPct={spentPct} risk={risk} />
            <div className="ph-overview-budget-figures">
              <span className="ph-overview-stat-value">{formatCurrency(actual)}</span>
              <span className="ph-muted">of {formatCurrency(budgeted)} spent</span>
            </div>
          </div>

          <div className="ph-overview-detail-rows">
            <div className={`ph-detail-row${milestoneWarn ? ' ph-detail-row-warn' : ''}`}>
              <span className="ph-detail-label">Next milestone</span>
              {milestone ? (
                <span className="ph-detail-value">
                  {milestone.name}
                  {milestone.due_date && (
                    <span className="ph-detail-sub"> — {milestoneWarn ? 'overdue ' : 'due '}{formatDueDate(milestone.due_date)}</span>
                  )}
                </span>
              ) : (
                <span className="ph-detail-value ph-muted">None scheduled</span>
              )}
            </div>

            <div className={`ph-detail-row ph-last-log${logStale ? ' ph-last-log-stale' : ''}`}>
              <span className="ph-last-log-dot" />
              {lastLog ? (
                <span className="ph-detail-value">
                  <span className="ph-detail-sub">{formatLogTimestamp(lastLog.logged_at)}</span>
                  {lastLog.excerpt && ` — ${lastLog.excerpt}`}
                </span>
              ) : (
                <span className="ph-detail-value ph-muted">No daily logs yet</span>
              )}
            </div>
          </div>

          <div className="ph-overview-signals">
            <SignalRow label="Permits" signal={summary?.permits_status} warnStatuses={['expiring_soon', 'expired']} />
            <SignalRow label="Milestones" signal={summary?.milestones_status} warnStatuses={['due_soon', 'overdue']} />
            <SignalRow label="Invoices" signal={summary?.invoices_status} warnStatuses={['overdue']} />
          </div>
        </>
      )}
    </div>
  );
}

function KpiTile({ label, value, sub }) {
  return (
    <div className="ph-kpi-tile">
      <span className="ph-kpi-label">{label}</span>
      <span className="ph-kpi-value">{value}</span>
      {sub && <span className="ph-kpi-sub">{sub}</span>}
    </div>
  );
}

function ComparisonChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  return (
    <div className="ph-chart-tooltip">
      <strong>{label}</strong>
      <div>Budget: {formatCurrency(row.budget_total)}</div>
      <div>Spent: {formatCurrency(row.budget_spent)} ({riskInfo(row.risk_status).label})</div>
    </div>
  );
}

function PortfolioSummary({ activeProjects }) {
  const totals = useMemo(() => {
    const totalBudget = activeProjects.reduce((s, p) => s + (Number(p.budget_total) || 0), 0);
    const totalSpent = activeProjects.reduce((s, p) => s + (Number(p.budget_spent) || 0), 0);
    const atRiskCount = activeProjects.filter((p) => p.risk_status === 'at_risk' || p.risk_status === 'over_budget').length;

    let nearest = null;
    for (const p of activeProjects) {
      if (!p.next_milestone?.due_date) continue;
      if (!nearest || p.next_milestone.due_date < nearest.next_milestone.due_date) nearest = p;
    }

    return { totalBudget, totalSpent, atRiskCount, nearest };
  }, [activeProjects]);

  const spentPct = totals.totalBudget > 0 ? Math.round((totals.totalSpent / totals.totalBudget) * 100) : null;

  const chartData = activeProjects.map((p) => ({
    name: p.name.length > 18 ? `${p.name.slice(0, 17)}…` : p.name,
    fullName: p.name,
    budget_total: Number(p.budget_total) || 0,
    budget_spent: Number(p.budget_spent) || 0,
    risk_status: p.risk_status,
  }));

  return (
    <div className="ph-portfolio">
      <div className="ph-kpi-grid">
        <KpiTile label="Total budget" value={formatCurrency(totals.totalBudget)} sub={`${activeProjects.length} active project${activeProjects.length === 1 ? '' : 's'}`} />
        <KpiTile label="Total spent" value={formatCurrency(totals.totalSpent)} sub={spentPct === null ? null : `${spentPct}% of budget`} />
        <KpiTile
          label="Needs attention"
          value={totals.atRiskCount}
          sub={totals.atRiskCount === 1 ? 'project at risk / over budget' : 'projects at risk / over budget'}
        />
        <KpiTile
          label="Nearest milestone"
          value={totals.nearest ? totals.nearest.next_milestone.name : 'None scheduled'}
          sub={totals.nearest ? `${totals.nearest.name} — ${formatDueDate(totals.nearest.next_milestone.due_date)}` : null}
        />
      </div>

      {chartData.length > 0 && (
        <div className="ph-comparison-chart">
          <div className="ph-category-label">Budget vs. actual spend</div>
          <ResponsiveContainer width="100%" height={Math.max(220, chartData.length * 46)}>
            <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 24, bottom: 4, left: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-light)" horizontal={false} />
              <XAxis type="number" tickFormatter={(v) => formatCurrency(v)} tick={{ fontSize: 11, fill: 'var(--slate)' }} />
              <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 12, fill: 'var(--inkwell)' }} />
              <Tooltip content={<ComparisonChartTooltip />} cursor={{ fill: 'var(--parchment)' }} />
              <Bar dataKey="budget_total" name="Budget" fill="var(--border-light)" radius={[3, 3, 3, 3]} barSize={14} />
              <Bar dataKey="budget_spent" name="Spent" radius={[3, 3, 3, 3]} barSize={14}>
                {chartData.map((row, i) => (
                  <Cell key={i} fill={riskInfo(row.risk_status).color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

export default function ProjectsOverviewPage({ user, userId }) {
  const { projects, setCurrentProjectId } = useContext(ProjectContext);
  const capitalLocked = isModuleLocked(user?.active_modules, 'capital', user?.account_status);

  const [summaries, setSummaries] = useState({});
  const [dashboard, setDashboard] = useState({});
  const [loading, setLoading] = useState(!capitalLocked);

  useEffect(() => {
    if (capitalLocked) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([
      fetch(`${API_BASE_URL}/api/capital/projects?userId=${userId}`).then((r) => r.json()),
      fetch(`${API_BASE_URL}/api/dashboard/summary?userId=${userId}`).then((r) => r.json()),
    ])
      .then(([capitalData, dashboardData]) => {
        if (cancelled) return;
        if (capitalData.success) {
          const byId = {};
          for (const p of capitalData.projects || []) byId[p.id] = p;
          setSummaries(byId);
        }
        if (dashboardData.success) {
          const byId = {};
          for (const p of dashboardData.projects || []) byId[p.id] = p;
          setDashboard(byId);
        }
      })
      .catch((err) => console.error('Fetch projects overview error:', err))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [userId, capitalLocked]);

  const openProject = (project) => {
    // Full page nav (this app has no client router) — set the shared
    // header/sidebar project switcher first so Project Detail lands on the
    // project that was clicked, not whatever was previously selected.
    setCurrentProjectId(String(project.id));
    window.location.href = '/project';
  };

  const activeProjects = useMemo(
    () => Object.values(dashboard).filter((p) => p.status === 'active'),
    [dashboard],
  );

  return (
    <div className="ph-container">
      <div className="ph-header">
        <div className="ph-badge">DASHBOARD</div>
        <h1 className="ph-title">Your projects</h1>
      </div>

      {!capitalLocked && !loading && activeProjects.length > 0 && (
        <PortfolioSummary activeProjects={activeProjects} />
      )}

      {projects.length === 0 ? (
        <p className="ph-muted">No projects yet.</p>
      ) : (
        <div className="ph-overview-grid">
          {projects.map((project) => (
            capitalLocked ? (
              <div key={project.id} className="ph-overview-card" onClick={() => openProject(project)}>
                <h3 className="ph-overview-card-title">{project.name}</h3>
                <p className="ph-muted">Upgrade to Capital Tracker to see budget and status here.</p>
              </div>
            ) : (
              <ProjectCard
                key={project.id}
                project={project}
                summary={summaries[project.id]}
                dash={dashboard[project.id]}
                loading={loading}
                onOpen={() => openProject(project)}
              />
            )
          ))}
        </div>
      )}
    </div>
  );
}
