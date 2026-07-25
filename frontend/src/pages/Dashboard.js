import React, { useContext, useEffect, useState } from 'react';
import { PRODUCTS } from '../config/products';
import { ProjectContext } from '../contexts/ProjectContext';
import '../styles/Dashboard.css';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

const MODULE_ICONS = { mail: '✉️', clash: '⚡', vendor: '🏢', connect: '⚡' };

function timeAgo(ts) {
  if (!ts) return '';
  const diff = (Date.now() - new Date(ts).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function ActivityFeedPanel({ userId }) {
  const { projects } = useContext(ProjectContext);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    fetch(`${API_BASE_URL}/api/activity/feed?userId=${userId}`)
      .then((res) => res.json())
      .then((data) => setItems(data.items || []))
      .catch((err) => console.error('Fetch activity feed error:', err))
      .finally(() => setLoading(false));
  }, [userId, projects.length]);

  if (projects.length <= 1) return null;

  return (
    <>
      <div className="pd-section-label" style={{ marginTop: 40 }}>Recent activity across projects</div>
      <div className="pd-activity-feed">
        {loading ? (
          <p className="pd-activity-empty">Loading…</p>
        ) : items.length === 0 ? (
          <p className="pd-activity-empty">No recent activity yet.</p>
        ) : (
          <ul className="pd-activity-list">
            {items.map((item, i) => (
              <li key={i} className="pd-activity-item">
                <span className="pd-activity-icon">{MODULE_ICONS[item.module] || '📋'}</span>
                <span className="pd-activity-title">{item.title}</span>
                <span className="pd-activity-project">{item.project_name}</span>
                <span className="pd-activity-time">{timeAgo(item.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

// Clean SVG icons for each product
const PRODUCT_ICONS = {
  constructmail: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="20" height="16" rx="2"/>
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
    </svg>
  ),
  clash: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 20h20"/>
      <path d="M5 20V8l7-6 7 6v12"/>
      <path d="M9 20v-6h6v6"/>
      <path d="M9 14h6"/>
    </svg>
  ),
  vendors: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
      <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  ),
  connect: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
    </svg>
  ),
  marketplace: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3h18l-1.5 9h-15z"/>
      <path d="M3 3 2 3"/>
      <circle cx="9" cy="20" r="1.5"/>
      <circle cx="17" cy="20" r="1.5"/>
      <path d="M5.5 12 5 3"/>
    </svg>
  ),
  trust: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2 4 5v6c0 5 3.5 8.5 8 11 4.5-2.5 8-6 8-11V5z"/>
      <path d="m9 12 2 2 4-4"/>
    </svg>
  ),
  capital: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="1" x2="12" y2="23"/>
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
    </svg>
  ),
  daily_logs: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="16" y1="13" x2="8" y2="13"/>
      <line x1="16" y1="17" x2="8" y2="17"/>
    </svg>
  ),
  invoice_tracker: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 2h9a2 2 0 0 1 2 2v16l-3-2-3 2-3-2-3 2V4a2 2 0 0 1 2-2z"/>
      <line x1="8" y1="7" x2="16" y2="7"/>
      <line x1="8" y1="11" x2="16" y2="11"/>
      <line x1="8" y1="15" x2="12" y2="15"/>
    </svg>
  ),
};

const SOON_ICONS = {
  'POMAR Specs': (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="16" y1="13" x2="8" y2="13"/>
      <line x1="16" y1="17" x2="8" y2="17"/>
    </svg>
  ),
  'POMAR Field': (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
      <circle cx="12" cy="10" r="3"/>
    </svg>
  ),
  'POMAR Closeout': (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  ),
};

const SOON_PRODUCTS = [
  { name: 'POMAR Specs',     desc: 'Submittal intelligence — match submittals to spec sections instantly' },
  { name: 'POMAR Field',     desc: 'Field-to-model sync — RFI answers that flow back to the model' },
  { name: 'POMAR Closeout',  desc: 'Handover intelligence — structured owner handover automatically' },
];

export default function ProductDashboard({ user, userId, onProductSelect }) {
  const firstName = user?.full_name?.split(' ')[0]
    || user?.name?.split(' ')[0]
    || user?.email?.split('@')[0]
    || 'there';
  const company = user?.company || '';
  const role    = user?.role    || '';

  const [marketplaceLicensed, setMarketplaceLicensed] = useState(null);

  useEffect(() => {
    if (!userId) return;
    fetch(`${API_BASE_URL}/api/marketplace/license?userId=${userId}`)
      .then((res) => res.json())
      .then((data) => setMarketplaceLicensed(!!data.licensed))
      .catch(() => setMarketplaceLicensed(false));
  }, [userId]);

  return (
    <div className="pd-container">
      <div className="pd-welcome">
        <h1 className="pd-title">Welcome back, {firstName} 👋</h1>
        {(company || role) && (
          <p className="pd-meta">
            {company}{company && role ? ' · ' : ''}{role}
          </p>
        )}
      </div>

      <div className="pd-section-label">Your tools</div>
      <div className="pd-grid">
        {PRODUCTS.filter(p => p.status === 'live')
          // India-only modules (POMAR Trust) never render for a non-matching
          // region, and are fully hidden — not shown as a locked/upgrade card —
          // until the company's feature flag is also enabled. This differs from
          // marketplace's licenseGated "upgrade" card on purpose: a US org
          // should never learn Trust exists at all.
          .filter(p => !p.regionGated || user?.company_region === p.regionGated)
          .filter(p => !p.regionGated || !!user?.active_modules?.[p.id])
          // A team member scoped to one module (users.restricted_module —
          // see services/access_control.py) only ever sees that module's
          // card here, mirroring components/Sidebar.js's same filter.
          .filter(p => !user?.restricted_module || p.id === user.restricted_module)
          .map(product => {
          const locked = (product.id === 'marketplace' && product.licenseGated && marketplaceLicensed !== true)
            || (product.id === 'capital' && product.licenseGated && !user?.active_modules?.capital)
            || (product.id === 'daily_logs' && product.licenseGated && !user?.active_modules?.daily_logs)
            || (product.id === 'invoice_tracker' && product.licenseGated && !user?.active_modules?.invoice_tracker);
          return (
            <div
              key={product.id}
              className={`pd-card ${locked ? 'pd-card-soon' : ''}`}
              onClick={() => { if (!locked) window.location.href = product.path; }}
            >
              <div className="pd-card-icon" style={{ color: locked ? 'var(--slate)' : 'var(--saffron)' }}>
                {PRODUCT_ICONS[product.id]}
              </div>
              <div className="pd-card-body">
                <h3 className="pd-card-title">{product.name}</h3>
                <p className="pd-card-desc">{product.description}</p>
              </div>
              {locked
                ? (
                  <div className="pd-card-badge pd-card-badge-locked">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="11" width="18" height="11" rx="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                    Upgrade
                  </div>
                )
                : <div className="pd-card-arrow">→</div>}
            </div>
          );
        })}
      </div>

      <div className="pd-section-label" style={{ marginTop: 40 }}>Coming soon</div>
      <div className="pd-grid">
        {SOON_PRODUCTS.map(p => (
          <div key={p.name} className="pd-card pd-card-soon">
            <div className="pd-card-icon" style={{ color: 'var(--slate)' }}>
              {SOON_ICONS[p.name]}
            </div>
            <div className="pd-card-body">
              <h3 className="pd-card-title">{p.name}</h3>
              <p className="pd-card-desc">{p.desc}</p>
            </div>
            <div className="pd-card-badge">Soon</div>
          </div>
        ))}
      </div>

      <ActivityFeedPanel userId={userId} />
    </div>
  );
}
