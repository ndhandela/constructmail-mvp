import React, { useContext, useState, useEffect, useCallback } from 'react';
import ModuleLockedNotice, { isModuleLocked } from '../../../components/ModuleLockedNotice';
import BackToProjectLink from '../../../components/BackToProjectLink';
import { ProjectContext, ALL_PROJECTS } from '../../../contexts/ProjectContext';
import { API_BASE_URL, formatCurrency, statusLabel } from '../invoicesUtils';
import InvoiceUploadForm from '../components/InvoiceUploadForm';
import '../styles/InvoiceTrackerApp.css';

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'pending', label: 'Pending' },
  { value: 'paid', label: 'Paid' },
];

// Project selection comes from the shared header/sidebar switcher, same as
// Capital Tracker/Daily Logs — no separate in-page picker. Unlike those two
// modules, the list itself still works with no project selected (ALL_PROJECTS
// shows invoices across every project), but uploading requires one, since an
// invoice always belongs to exactly one project.
export default function InvoiceTrackerApp({ user, userId }) {
  const invoiceTrackerLocked = isModuleLocked(user?.active_modules, 'invoice_tracker');
  const { projects, currentProjectId } = useContext(ProjectContext);
  const selectedProject = currentProjectId !== ALL_PROJECTS
    ? projects.find((p) => String(p.id) === String(currentProjectId))
    : null;

  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState(null);
  const [canWrite, setCanWrite] = useState(true);
  const [filters, setFilters] = useState({ status: '', date_from: '', date_to: '' });

  const fetchInvoices = useCallback(async () => {
    if (!user?.company_id) { setLoading(false); return; }
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ userId, companyId: user.company_id });
      if (currentProjectId !== ALL_PROJECTS) params.set('project_id', currentProjectId);
      if (filters.status) params.set('status', filters.status);
      if (filters.date_from) params.set('date_from', filters.date_from);
      if (filters.date_to) params.set('date_to', filters.date_to);
      const res = await fetch(`${API_BASE_URL}/api/invoices?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setInvoices(data.invoices || []);
        setCanWrite(!!data.can_write);
      } else {
        setError(data.detail || 'Could not load invoices.');
      }
    } catch (err) {
      console.error('Fetch invoices error:', err);
      setError('Network error. Try again.');
    } finally {
      setLoading(false);
    }
  }, [user, userId, currentProjectId, filters]);

  useEffect(() => { fetchInvoices(); }, [fetchInvoices]);

  const handleStatusToggle = async (invoice) => {
    const nextStatus = invoice.status === 'pending' ? 'paid' : 'pending';
    try {
      const res = await fetch(`${API_BASE_URL}/api/invoices/${invoice.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: Number(userId), status: nextStatus }),
      });
      const data = await res.json();
      if (data.success) {
        setInvoices((prev) => prev.map((i) => (i.id === invoice.id ? { ...i, ...data.invoice } : i)));
      }
    } catch (err) {
      console.error('Toggle invoice status error:', err);
    }
  };

  const handleDownload = async (invoice) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/invoices/${invoice.id}/download-url?userId=${userId}`);
      const data = await res.json();
      if (data.success) window.open(data.url, '_blank', 'noopener');
    } catch (err) {
      console.error('Download invoice error:', err);
    }
  };

  const handleDelete = async (invoice) => {
    if (!window.confirm(`Delete the invoice from ${invoice.vendor_name}?`)) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/invoices/${invoice.id}?userId=${userId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) fetchInvoices();
    } catch (err) {
      console.error('Delete invoice error:', err);
    }
  };

  if (invoiceTrackerLocked) {
    return (
      <div className="invoices-app">
        <ModuleLockedNotice
          moduleName="POMAR Invoice Tracker"
          companyName={user?.company}
          variant="upgrade"
          icon="🧾"
          description="Upload and track vendor invoices against your projects and budget. Upgrade your plan to unlock Invoice Tracker."
        />
      </div>
    );
  }

  return (
    <div className="invoices-app">
      <BackToProjectLink user={user} />
      <div className="invoices-hero">
        <div className="invoices-badge">POMAR INVOICE TRACKER</div>
        <h1>Vendor invoices, tracked in one place</h1>
        <p>Upload invoice PDFs, tag them to a project or budget line, and track paid vs. pending — no more digging through email.</p>
      </div>

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
          {canWrite && (
            <button
              className="invoices-btn-primary"
              onClick={() => setShowForm(true)}
              disabled={currentProjectId === ALL_PROJECTS}
              title={currentProjectId === ALL_PROJECTS ? 'Select a project from the header to upload an invoice' : undefined}
            >
              + Upload invoice
            </button>
          )}
        </div>

        {error && <div className="invoices-error">{error}</div>}

        {loading ? (
          <p className="invoices-muted">Loading invoices…</p>
        ) : invoices.length === 0 ? (
          <p className="invoices-muted">No invoices yet.{canWrite ? ' Upload one to get started.' : ''}</p>
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
                  <th>Uploaded By</th>
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
                      {canWrite ? (
                        <button
                          type="button"
                          className={`invoices-status-pill invoices-status-${inv.status}`}
                          onClick={() => handleStatusToggle(inv)}
                          title="Click to toggle status"
                        >
                          {statusLabel(inv.status)}
                        </button>
                      ) : (
                        <span className={`invoices-status-pill invoices-status-${inv.status}`}>{statusLabel(inv.status)}</span>
                      )}
                    </td>
                    <td>{inv.uploaded_by_name}</td>
                    <td className="invoices-row-actions">
                      <button className="invoices-link-btn" onClick={() => handleDownload(inv)}>Download</button>
                      {canWrite && (
                        <>
                          <button className="invoices-link-btn" onClick={() => setEditingInvoice(inv)}>Edit</button>
                          <button className="invoices-link-btn invoices-link-btn-danger" onClick={() => handleDelete(inv)}>Delete</button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showForm && selectedProject && (
        <InvoiceUploadForm
          userId={userId}
          projectId={selectedProject.id}
          onSaved={() => { setShowForm(false); fetchInvoices(); }}
          onCancel={() => setShowForm(false)}
        />
      )}
      {editingInvoice && (
        <InvoiceUploadForm
          userId={userId}
          projectId={editingInvoice.project_id}
          invoice={editingInvoice}
          onSaved={() => { setEditingInvoice(null); fetchInvoices(); }}
          onCancel={() => setEditingInvoice(null)}
        />
      )}
    </div>
  );
}
