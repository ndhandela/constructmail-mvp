import React, { useState, useEffect, useCallback } from 'react';
import '../styles/AnalyticsDashboard.css';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

const INSURANCE_LABELS = {
  verified: 'Verified',
  pending: 'Pending',
  not_verified: 'Not Verified',
};

const INSURANCE_COLORS = {
  verified: '#22c55e',
  pending: '#f59e0b',
  not_verified: '#ef4444',
};

function StatCard({ icon, label, value, sub }) {
  return (
    <div className="ana-stat-card">
      <div className="ana-stat-icon">{icon}</div>
      <div className="ana-stat-value">{value}</div>
      <div className="ana-stat-label">{label}</div>
      {sub && <div className="ana-stat-sub">{sub}</div>}
    </div>
  );
}

function BarChart({ data, valueKey = 'count', labelKey = 'trade', title }) {
  if (!data || data.length === 0) return <div className="ana-empty">No data</div>;
  const max = Math.max(...data.map(d => d[valueKey]));
  return (
    <div className="ana-bar-chart">
      <div className="ana-chart-title">{title}</div>
      {data.map((row, i) => (
        <div className="ana-bar-row" key={i}>
          <div className="ana-bar-label">{row[labelKey] || 'Unknown'}</div>
          <div className="ana-bar-track">
            <div
              className="ana-bar-fill"
              style={{ width: `${Math.round((row[valueKey] / max) * 100)}%` }}
            />
          </div>
          <div className="ana-bar-count">{row[valueKey]}</div>
        </div>
      ))}
    </div>
  );
}

function SignupSparkline({ data }) {
  if (!data || data.length === 0) return <div className="ana-empty">No signups in last 30 days</div>;

  // Build a 30-day array filled with 0s
  const days = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const found = data.find(r => r.day && r.day.slice(0, 10) === key);
    days.push({ date: key, count: found ? found.count : 0 });
  }

  const max = Math.max(...days.map(d => d.count), 1);
  const W = 600, H = 80, pad = 8;
  const pts = days.map((d, i) => {
    const x = pad + (i / (days.length - 1)) * (W - pad * 2);
    const y = H - pad - (d.count / max) * (H - pad * 2);
    return `${x},${y}`;
  });

  return (
    <div className="ana-sparkline-wrap">
      <div className="ana-chart-title">User Signups — Last 30 Days</div>
      <svg viewBox={`0 0 ${W} ${H}`} className="ana-sparkline" preserveAspectRatio="none">
        <polyline
          fill="none"
          stroke="var(--saffron)"
          strokeWidth="2"
          points={pts.join(' ')}
        />
        {days.map((d, i) => {
          if (d.count === 0) return null;
          const x = pad + (i / (days.length - 1)) * (W - pad * 2);
          const y = H - pad - (d.count / max) * (H - pad * 2);
          return (
            <circle key={i} cx={x} cy={y} r="3" fill="var(--saffron)">
              <title>{d.date}: {d.count} signup{d.count !== 1 ? 's' : ''}</title>
            </circle>
          );
        })}
      </svg>
      <div className="ana-sparkline-labels">
        <span>{days[0].date.slice(5)}</span>
        <span>{days[days.length - 1].date.slice(5)}</span>
      </div>
    </div>
  );
}

function InsurancePills({ data }) {
  if (!data || data.length === 0) return <div className="ana-empty">No data</div>;
  const total = data.reduce((s, r) => s + r.count, 0);
  return (
    <div className="ana-insurance-wrap">
      <div className="ana-chart-title">Vendors by Insurance Status</div>
      <div className="ana-insurance-bar">
        {data.map((r, i) => (
          <div
            key={i}
            className="ana-insurance-segment"
            style={{
              width: `${Math.round((r.count / total) * 100)}%`,
              background: INSURANCE_COLORS[r.insurance_status] || '#94a3b8',
            }}
            title={`${INSURANCE_LABELS[r.insurance_status] || r.insurance_status}: ${r.count}`}
          />
        ))}
      </div>
      <div className="ana-insurance-legend">
        {data.map((r, i) => (
          <div className="ana-legend-item" key={i}>
            <span className="ana-legend-dot" style={{ background: INSURANCE_COLORS[r.insurance_status] || '#94a3b8' }} />
            <span>{INSURANCE_LABELS[r.insurance_status] || r.insurance_status}</span>
            <strong>{r.count}</strong>
            <span className="ana-legend-pct">({Math.round((r.count / total) * 100)}%)</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AnalyticsDashboard({ token, onNavigate }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchAnalytics = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/analytics`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Failed to load analytics');
      setData(json);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { fetchAnalytics(); }, [fetchAnalytics]);

  return (
    <div className="ana-page">
      <div className="admin-header">
        <div className="admin-header-left">
          <button className="ana-back-btn" onClick={() => onNavigate('dashboard')}>← Back</button>
          <h1>Analytics</h1>
        </div>
        <button className="ana-refresh-btn" onClick={fetchAnalytics} disabled={loading}>
          {loading ? 'Loading…' : '↻ Refresh'}
        </button>
      </div>

      <div className="ana-container">
        {error && <div className="ana-error">{error}</div>}

        {loading && !data && (
          <div className="ana-loading">Loading analytics…</div>
        )}

        {data && (
          <>
            {/* Stat Cards */}
            <div className="ana-stat-grid">
              <StatCard icon="👤" label="Total Users" value={data.users.total.toLocaleString()} sub={`+${data.users.last30Days} this month`} />
              <StatCard icon="🏢" label="Total Vendors" value={data.vendors.total.toLocaleString()} />
              <StatCard icon="⭐" label="Total Reviews" value={data.reviews.total.toLocaleString()} sub={`Avg ${data.reviews.avgRating > 0 ? data.reviews.avgRating.toFixed(1) : '—'} / 5.0`} />
              <StatCard icon="📅" label="New Users (30d)" value={data.users.last30Days.toLocaleString()} />
            </div>

            {/* Signup Sparkline */}
            <div className="ana-card">
              <SignupSparkline data={data.users.signupsByDay} />
            </div>

            {/* Two columns: trade breakdown + insurance */}
            <div className="ana-two-col">
              <div className="ana-card">
                <BarChart data={data.vendors.byTrade} valueKey="count" labelKey="trade" title="Top Vendor Trades" />
              </div>
              <div className="ana-card">
                <InsurancePills data={data.vendors.byInsurance} />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
