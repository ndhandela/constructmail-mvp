import React, { useContext, useState, useEffect, useCallback } from 'react';
import ModuleLockedNotice, { isModuleLocked } from '../../../components/ModuleLockedNotice';
import PageHeader from '../../../components/PageHeader';
import { ProjectContext, ALL_PROJECTS } from '../../../contexts/ProjectContext';
import { isProjectOwner } from '../../capital/capitalUtils';
import {
  API_BASE_URL, formatCurrency, formatDate, statusMeta, orderTotal, lineTotal,
} from '../ordersUtils';
import OrderForm from '../components/OrderForm';
import '../styles/OrdersApp.css';

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'draft', label: 'Draft' },
  { value: 'sent', label: 'Sent' },
  { value: 'received', label: 'Received' },
  { value: 'closed', label: 'Closed' },
  { value: 'logged', label: 'Logged' },
];
const TYPE_OPTIONS = [
  { value: '', label: 'All types' },
  { value: 'vendor', label: 'Vendor orders' },
  { value: 'direct', label: 'Direct purchases' },
];

export default function OrdersApp({ user, userId }) {
  const ordersLocked = isModuleLocked(user?.active_modules, 'orders', user?.account_status);
  const { projects, currentProjectId } = useContext(ProjectContext);
  const selectedProject = currentProjectId !== ALL_PROJECTS
    ? projects.find((p) => String(p.id) === String(currentProjectId))
    : null;
  const canWrite = isProjectOwner(selectedProject, user);

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState({ status: '', order_type: '', work_item_id: '', vendor_id: '' });

  const [workItems, setWorkItems] = useState([]);
  const [budgetItems, setBudgetItems] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [members, setMembers] = useState([]);

  const [showForm, setShowForm] = useState(false);
  const [editingOrder, setEditingOrder] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [receiptNote, setReceiptNote] = useState(null);
  const [actionBusy, setActionBusy] = useState(false);

  // Deep-link from Stock's reorder card: /orders?new=1&desc=&qty=&unit_cost=
  const [prefillLines, setPrefillLines] = useState(null);
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get('new') === '1') {
      const desc = p.get('desc');
      setPrefillLines(desc ? [{
        item_description: desc,
        qty: p.get('qty') || '',
        unit: p.get('unit') || '',
        unit_cost: p.get('unit_cost') || '',
      }] : []);
      setShowForm(true);
      window.history.replaceState({}, document.title, '/orders');
    }
  }, []);

  const projectId = selectedProject?.id;

  const fetchOrders = useCallback(async () => {
    if (!projectId) { setOrders([]); setLoading(false); return; }
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ userId, project_id: projectId });
      Object.entries(filters).forEach(([k, v]) => { if (v) params.set(k, v); });
      const res = await fetch(`${API_BASE_URL}/api/orders?${params.toString()}`);
      const data = await res.json();
      if (res.ok && data.success) setOrders(data.orders || []);
      else setError((typeof data.detail === 'string' && data.detail) || 'Could not load orders.');
    } catch (err) {
      console.error('Fetch orders error:', err);
      setError('Network error. Try again.');
    } finally {
      setLoading(false);
    }
  }, [projectId, userId, filters]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  useEffect(() => {
    if (!projectId) return;
    const load = async (path, key, setter) => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/orders/projects/${projectId}/${path}?userId=${userId}`);
        const data = await res.json();
        if (res.ok && data.success) setter(data[key] || []);
      } catch (err) { console.error(`Fetch ${path} error:`, err); }
    };
    load('work-items', 'work_items', setWorkItems);
    load('budget-items', 'budget_items', setBudgetItems);
    load('vendors', 'vendors', setVendors);
    fetch(`${API_BASE_URL}/api/projects/${projectId}/members?userId=${userId}`)
      .then((r) => r.json())
      .then((d) => setMembers(d.members || d.data || []))
      .catch(() => setMembers([]));
  }, [projectId, userId]);

  const openDetail = useCallback(async (orderId) => {
    setSelectedId(orderId);
    setReceiptNote(null);
    setDetail(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/orders/${orderId}?userId=${userId}`);
      const data = await res.json();
      if (res.ok && data.success) setDetail(data.order);
    } catch (err) { console.error('Fetch order detail error:', err); }
  }, [userId]);

  const closeDetail = () => { setSelectedId(null); setDetail(null); setReceiptNote(null); };

  const patchStatus = async (status) => {
    setActionBusy(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/orders/${detail.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: Number(userId), status }),
      });
      const data = await res.json();
      if (res.ok && data.success) { setDetail(data.order); fetchOrders(); }
      else alert((typeof data.detail === 'string' && data.detail) || 'Could not update the order.');
    } catch (err) { console.error('Patch status error:', err); }
    finally { setActionBusy(false); }
  };

  const markReceived = async () => {
    setActionBusy(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/orders/${detail.id}/mark-received`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: Number(userId) }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setDetail(data.order);
        setReceiptNote(data.receipt);
        fetchOrders();
      } else alert((typeof data.detail === 'string' && data.detail) || 'Could not mark received.');
    } catch (err) { console.error('Mark received error:', err); }
    finally { setActionBusy(false); }
  };

  const deleteOrder = async () => {
    if (!window.confirm(`Delete order #${detail.id}? This also reverses its budget effect.`)) return;
    setActionBusy(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/orders/${detail.id}?userId=${userId}`, { method: 'DELETE' });
      const data = await res.json();
      if (res.ok && data.success) { closeDetail(); fetchOrders(); }
      else alert((typeof data.detail === 'string' && data.detail) || 'Could not delete the order.');
    } catch (err) { console.error('Delete order error:', err); }
    finally { setActionBusy(false); }
  };

  if (ordersLocked) {
    return (
      <div className="orders-app">
        <ModuleLockedNotice
          moduleName="POMAR Orders"
          companyName={user?.company}
          variant="upgrade"
          icon="🧾"
          description="Track vendor orders and direct purchases against your budget. Upgrade your plan to unlock Orders."
        />
      </div>
    );
  }

  const renderDetail = () => {
    if (!detail) return <p className="orders-muted">Loading order…</p>;
    const meta = statusMeta(detail.status);
    const isVendor = detail.order_type === 'vendor';
    const total = orderTotal(detail.line_items);
    return (
      <div className="orders-detail">
        <div className="orders-detail-head">
          <div>
            <h2 className="orders-detail-title">
              Order #{detail.id} · <span className="orders-type-tag">{isVendor ? 'Vendor order' : 'Direct purchase'}</span>
            </h2>
            <span className={`orders-status-pill ${meta.className}`}>{meta.label}</span>
          </div>
          {canWrite && detail.status !== 'received' && detail.status !== 'closed' && (
            <button className="orders-link-btn" onClick={() => { setEditingOrder(detail); }}>Edit</button>
          )}
        </div>

        <div className="orders-detail-grid">
          <div className="orders-detail-field">
            <div className="orders-detail-label">{isVendor ? 'Vendor' : 'Purchased from'}</div>
            <div className="orders-detail-value">{detail.vendor_display_name || '—'}</div>
          </div>
          <div className="orders-detail-field">
            <div className="orders-detail-label">Work item</div>
            <div className="orders-detail-value">{detail.work_item_name || '—'}</div>
          </div>
          {!isVendor && (
            <div className="orders-detail-field">
              <div className="orders-detail-label">Purchased by</div>
              <div className="orders-detail-value">{detail.purchased_by_name || '—'}</div>
            </div>
          )}
          <div className="orders-detail-field">
            <div className="orders-detail-label">{isVendor ? 'Purchase date' : 'Purchase date'}</div>
            <div className="orders-detail-value">{formatDate(detail.purchase_date)}</div>
          </div>
          <div className="orders-detail-field">
            <div className="orders-detail-label">Budget line</div>
            <div className="orders-detail-value">{detail.budget_item_label || 'Not linked'}</div>
          </div>
          <div className="orders-detail-field">
            <div className="orders-detail-label">Created by</div>
            <div className="orders-detail-value">{detail.created_by_name || '—'}</div>
          </div>
        </div>

        <table className="orders-lines-table">
          <thead>
            <tr>
              <th>Description</th>
              <th className="orders-num">Qty</th>
              <th>Unit</th>
              <th className="orders-num">Unit cost</th>
              <th className="orders-num">Line total</th>
            </tr>
          </thead>
          <tbody>
            {(detail.line_items || []).map((li) => (
              <tr key={li.id}>
                <td>{li.item_description}</td>
                <td className="orders-num">{Number(li.qty)}</td>
                <td>{li.unit || '—'}</td>
                <td className="orders-num">{formatCurrency(li.unit_cost)}</td>
                <td className="orders-num">{formatCurrency(lineTotal(li))}</td>
              </tr>
            ))}
            <tr className="orders-lines-total-row">
              <td colSpan={4}>Order total</td>
              <td className="orders-num">{formatCurrency(total)}</td>
            </tr>
          </tbody>
        </table>

        {detail.notes && (
          <div className="orders-detail-field" style={{ marginTop: 16 }}>
            <div className="orders-detail-label">Notes</div>
            <div className="orders-detail-value">{detail.notes}</div>
          </div>
        )}
        {detail.attachment_url && (
          <div className="orders-detail-field" style={{ marginTop: 12 }}>
            <div className="orders-detail-label">Attachment</div>
            <div className="orders-detail-value">
              <a href={detail.attachment_url} target="_blank" rel="noopener noreferrer">{detail.attachment_url}</a>
            </div>
          </div>
        )}

        {receiptNote && (
          <div className={`orders-receipt-note ${receiptNote.matched?.length && !receiptNote.unmatched?.length ? 'orders-receipt-ok' : ''}`}>
            {!receiptNote.stock_enabled && 'Stock module is off — nothing was added to inventory.'}
            {receiptNote.stock_enabled && (
              <>
                {receiptNote.matched?.length > 0 && (
                  <div>Added to inventory: {receiptNote.matched.map((m) => `${m.item_description} (+${Number(m.qty)})`).join(', ')}.</div>
                )}
                {receiptNote.unmatched?.length > 0 && (
                  <div>No matching inventory item for: {receiptNote.unmatched.map((m) => m.item_description).join(', ')}. Create those items in Stock to track them.</div>
                )}
                {!receiptNote.matched?.length && !receiptNote.unmatched?.length && 'Order received.'}
              </>
            )}
          </div>
        )}

        {canWrite && (
          <div className="orders-detail-actions">
            {isVendor && detail.status === 'draft' && (
              <button className="orders-btn-primary" disabled={actionBusy} onClick={() => patchStatus('sent')}>Send to vendor</button>
            )}
            {isVendor && (detail.status === 'draft' || detail.status === 'sent') && (
              <button className="orders-btn-primary" disabled={actionBusy} onClick={markReceived}>Mark received</button>
            )}
            {isVendor && detail.status === 'received' && (
              <button className="orders-btn-secondary" disabled={actionBusy} onClick={() => patchStatus('closed')}>Close order</button>
            )}
            {!isVendor && detail.status === 'draft' && (
              <button className="orders-btn-primary" disabled={actionBusy} onClick={() => patchStatus('logged')}>Log purchase</button>
            )}
            {(detail.status === 'draft' || detail.status === 'sent') && (
              <button className="orders-btn-danger" disabled={actionBusy} onClick={deleteOrder}>Delete</button>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="orders-app">
      <div className="orders-container">
        <PageHeader
          backLabel={selectedId ? 'Back to orders' : `Back to ${selectedProject?.name || 'Project'}`}
          backHref={selectedId ? undefined : (user?.new_nav_enabled ? '/project' : undefined)}
          onBack={selectedId ? closeDetail : undefined}
          title={selectedId ? 'Order detail' : 'Orders'}
          actionLabel={!selectedId && canWrite ? '+ New order' : undefined}
          onAction={() => { setPrefillLines(null); setShowForm(true); }}
          actionDisabled={!selectedProject}
          actionTitle={!selectedProject ? 'Select a project from the header first' : undefined}
        />

        {!selectedProject ? (
          <p className="orders-muted">Select a project from the header to view its orders.</p>
        ) : selectedId ? (
          renderDetail()
        ) : (
          <>
            <div className="orders-toolbar">
              <select value={filters.order_type} onChange={(e) => setFilters((f) => ({ ...f, order_type: e.target.value }))}>
                {TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <select value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}>
                {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <select value={filters.work_item_id} onChange={(e) => setFilters((f) => ({ ...f, work_item_id: e.target.value }))}>
                <option value="">All work items</option>
                {workItems.map((wi) => <option key={wi.id} value={wi.id}>{wi.name}</option>)}
              </select>
              <select value={filters.vendor_id} onChange={(e) => setFilters((f) => ({ ...f, vendor_id: e.target.value }))}>
                <option value="">All vendors</option>
                {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </div>

            {error && <div className="orders-error">{error}</div>}

            {loading ? (
              <p className="orders-muted">Loading orders…</p>
            ) : orders.length === 0 ? (
              <p className="orders-muted">No orders yet.{canWrite ? ' Create one to get started.' : ''}</p>
            ) : (
              <div className="orders-table-wrapper">
                <table className="orders-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Type</th>
                      <th>Vendor / Source</th>
                      <th>Work item</th>
                      <th>Lines</th>
                      <th>Total</th>
                      <th>Date</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((o) => {
                      const meta = statusMeta(o.status);
                      return (
                        <tr key={o.id} onClick={() => openDetail(o.id)}>
                          <td>{o.id}</td>
                          <td><span className="orders-type-tag">{o.order_type === 'vendor' ? 'Vendor' : 'Direct'}</span></td>
                          <td>{o.vendor_display_name || '—'}</td>
                          <td>{o.work_item_name || '—'}</td>
                          <td>{(o.line_items || []).length}</td>
                          <td>{formatCurrency(o.total)}</td>
                          <td>{formatDate(o.purchase_date)}</td>
                          <td><span className={`orders-status-pill ${meta.className}`}>{meta.label}</span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>

      {showForm && selectedProject && (
        <OrderForm
          userId={userId}
          projectId={selectedProject.id}
          prefillLines={prefillLines}
          workItems={workItems}
          budgetItems={budgetItems}
          vendors={vendors}
          members={members}
          onSaved={(saved) => { setShowForm(false); setPrefillLines(null); fetchOrders(); if (saved?.id) openDetail(saved.id); }}
          onCancel={() => { setShowForm(false); setPrefillLines(null); }}
        />
      )}
      {editingOrder && (
        <OrderForm
          userId={userId}
          projectId={editingOrder.project_id}
          order={editingOrder}
          workItems={workItems}
          budgetItems={budgetItems}
          vendors={vendors}
          members={members}
          onSaved={(saved) => { setEditingOrder(null); fetchOrders(); if (saved?.id) openDetail(saved.id); }}
          onCancel={() => setEditingOrder(null)}
        />
      )}
    </div>
  );
}
