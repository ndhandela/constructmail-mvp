import React, { useState, useEffect, useCallback } from 'react';
import { API_BASE_URL, formatCurrency, statusLabel } from '../invoicesUtils';
import '../styles/InvoiceTrackerApp.css';

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'pending', label: 'Pending' },
  { value: 'paid', label: 'Paid' },
];

// Minimal standalone view for an external accountant account — no
// AppLayout, no Header, no Sidebar, no other module reachable from here.
// Mounted directly by App.js at /accountant, completely separate from the
// normal product shell every other module uses. Read-only: no upload/
// edit/delete controls, matching the accountant's server-side permissions
// (services/invoice_helpers.require_company_invoice_access always returns
// can_write=false for an accountant, enforced independently of this UI).
export default function AccountantInvoiceView({ user, userId, onLogout }) {
  const invites = user?.pending_accountant_invites || [];
  const [companyId, setCompanyId] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState({ status: '', date_from: '', date_to: '' });
  const [accepting, setAccepting] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [acceptError, setAcceptError] = useState('');
  // App.js doesn't refetch /api/auth/me after a successful accept, so
  // `user.pending_accountant_invites` stays stale for the rest of this
  // session — this local flag is what actually flips the view over,
  // rather than re-deriving from the (now outdated) prop.
  const [justAccepted, setJustAccepted] = useState(false);

  const needsPassword = !user?.has_password;
  const pendingInvite = !justAccepted ? invites[0] : null;

  const fetchInvoices = useCallback(async (forCompanyId) => {
    if (!forCompanyId) return;
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ userId, companyId: forCompanyId });
      if (filters.status) params.set('status', filters.status);
      if (filters.date_from) params.set('date_from', filters.date_from);
      if (filters.date_to) params.set('date_to', filters.date_to);
      const res = await fetch(`${API_BASE_URL}/api/invoices?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setInvoices(data.invoices || []);
      } else {
        setError(data.detail || 'Could not load invoices.');
      }
    } catch (err) {
      console.error('Fetch accountant invoices error:', err);
      setError('Network error. Try again.');
    } finally {
      setLoading(false);
    }
  }, [userId, filters]);

  useEffect(() => {
    if (pendingInvite) {
      setCompanyId(pendingInvite.company_id);
      return;
    }
    // No pending invite — this is a returning, already-accepted
    // accountant. /api/auth/me only surfaces *pending* invites (see
    // routers/auth.py's get_me), so fall back to the accepted-grants list.
    fetch(`${API_BASE_URL}/api/invoice-accountants/mine?userId=${userId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.companies?.length > 0) {
          setCompanyId(data.companies[0].company_id);
        } else {
          setLoading(false);
        }
      })
      .catch((err) => {
        console.error('Fetch accountant companies error:', err);
        setLoading(false);
      });
  }, [pendingInvite, userId]);

  useEffect(() => {
    if (companyId) fetchInvoices(companyId);
  }, [companyId, fetchInvoices]);

  const handleDownload = async (invoice) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/invoices/${invoice.id}/download-url?userId=${userId}`);
      const data = await res.json();
      if (data.success) window.open(data.url, '_blank', 'noopener');
    } catch (err) {
      console.error('Download invoice error:', err);
    }
  };

  const handleAccept = async () => {
    setAcceptError('');
    if (needsPassword) {
      if (password.length < 8) { setAcceptError('Password must be at least 8 characters.'); return; }
      if (password !== confirmPassword) { setAcceptError('Passwords do not match.'); return; }
    }
    setAccepting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/invoice-accountants/${pendingInvite.access_id}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: Number(userId),
          ...(needsPassword ? { password } : {}),
        }),
      });
      const data = await res.json();
      if (data.success) {
        setJustAccepted(true);
        setCompanyId(data.access.company_id);
      } else {
        setAcceptError(data.detail || 'Could not accept invite.');
      }
    } catch (err) {
      console.error('Accept accountant invite error:', err);
      setAcceptError('Network error. Try again.');
    } finally {
      setAccepting(false);
    }
  };

  if (pendingInvite) {
    return (
      <div className="invoices-accountant-shell">
        <header className="invoices-accountant-header">
          <span className="invoices-accountant-header-brand">POMAR Invoices</span>
          {onLogout && (
            <button className="invoices-link-btn" onClick={onLogout}>Sign out</button>
          )}
        </header>
        <div className="invoices-container" style={{ maxWidth: 480 }}>
          <div className="invoices-modal" style={{ margin: '40px auto', boxShadow: 'none', border: '1px solid #E7E0D3' }}>
            <h3>You've been invited to view invoices for {pendingInvite.company_name}</h3>
            <p className="invoices-muted">
              Invited by {pendingInvite.invited_by_name}. You'll get read-only access to view and
              download invoices for this company — nothing else.
            </p>
            {needsPassword && (
              <>
                <div className="invoices-field">
                  <label>Set a password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 8 characters"
                    autoComplete="new-password"
                  />
                </div>
                <div className="invoices-field">
                  <label>Confirm password</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    autoComplete="new-password"
                  />
                </div>
              </>
            )}
            {acceptError && <div className="invoices-error">{acceptError}</div>}
            <div className="invoices-form-actions">
              <button className="invoices-btn-primary" onClick={handleAccept} disabled={accepting}>
                {accepting ? 'Accepting…' : 'Accept invite'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="invoices-accountant-shell">
      <header className="invoices-accountant-header">
        <span className="invoices-accountant-header-brand">POMAR Invoices</span>
        <span className="invoices-accountant-header-company">{user?.email}</span>
        {onLogout && (
          <button className="invoices-link-btn" onClick={onLogout}>Sign out</button>
        )}
      </header>

      <div className="invoices-container">
        <div className="invoices-toolbar">
          <div className="invoices-filters">
            <select
              value={filters.status}
              onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <input
              type="date"
              value={filters.date_from}
              onChange={(e) => setFilters((f) => ({ ...f, date_from: e.target.value }))}
              aria-label="From date"
            />
            <span className="invoices-filter-sep">to</span>
            <input
              type="date"
              value={filters.date_to}
              onChange={(e) => setFilters((f) => ({ ...f, date_to: e.target.value }))}
              aria-label="To date"
            />
          </div>
        </div>

        {error && <div className="invoices-error">{error}</div>}

        {!companyId ? (
          <p className="invoices-muted">No invoice access has been granted to this account yet.</p>
        ) : loading ? (
          <p className="invoices-muted">Loading invoices…</p>
        ) : invoices.length === 0 ? (
          <p className="invoices-muted">No invoices yet.</p>
        ) : (
          <div className="invoices-table-wrapper">
            <table className="invoices-table">
              <thead>
                <tr>
                  <th>Vendor</th>
                  <th>Invoice #</th>
                  <th>Project</th>
                  <th>Work Item</th>
                  <th>Amount</th>
                  <th>Invoice Date</th>
                  <th>Due Date</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.id}>
                    <td>{inv.vendor_name}</td>
                    <td>{inv.invoice_number || '—'}</td>
                    <td>{inv.project_name}</td>
                    <td>{inv.work_item_name || '—'}</td>
                    <td>{formatCurrency(inv.amount)}</td>
                    <td>{inv.invoice_date || '—'}</td>
                    <td>{inv.due_date || '—'}</td>
                    <td>
                      <span className={`invoices-status-pill invoices-status-${inv.status}`}>{statusLabel(inv.status)}</span>
                    </td>
                    <td>
                      <button className="invoices-link-btn" onClick={() => handleDownload(inv)}>Download</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
