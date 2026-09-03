import React, { useContext, useState, useEffect, useCallback } from 'react';
import ModuleLockedNotice, { isModuleLocked } from '../../../components/ModuleLockedNotice';
import PageHeader from '../../../components/PageHeader';
import { ProjectContext, ALL_PROJECTS } from '../../../contexts/ProjectContext';
import { isProjectOwner } from '../../capital/capitalUtils';
import {
  API_BASE_URL, formatCurrency, formatQty, formatDateTime, statusDot, txnMeta,
} from '../stockUtils';
import InventoryItemForm from '../components/InventoryItemForm';
import LogTransactionForm from '../components/LogTransactionForm';
import '../styles/StockApp.css';

// Deep-link into a pre-filled new Orders form (only rendered when the
// company also has 'orders' enabled — see reorder card below).
function createOrderHref(suggestion) {
  const p = new URLSearchParams({
    new: '1',
    desc: suggestion.name,
    qty: String(suggestion.suggested_qty ?? ''),
    unit: suggestion.unit || '',
    unit_cost: String(suggestion.suggested_unit_cost ?? ''),
  });
  return `/orders?${p.toString()}`;
}

export default function StockApp({ user, userId }) {
  const stockLocked = isModuleLocked(user?.active_modules, 'stock', user?.account_status);
  const { projects, currentProjectId } = useContext(ProjectContext);
  const selectedProject = currentProjectId !== ALL_PROJECTS
    ? projects.find((p) => String(p.id) === String(currentProjectId))
    : null;
  const canWrite = isProjectOwner(selectedProject, user);
  const projectId = selectedProject?.id;

  const [items, setItems] = useState([]);
  const [ordersEnabled, setOrdersEnabled] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [showItemForm, setShowItemForm] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [showTxnForm, setShowTxnForm] = useState(false);

  const fetchList = useCallback(async () => {
    if (!projectId) { setItems([]); setSuggestions([]); setLoading(false); return; }
    setLoading(true);
    setError('');
    try {
      const [listRes, sugRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/stock?userId=${userId}&project_id=${projectId}`),
        fetch(`${API_BASE_URL}/api/stock/projects/${projectId}/reorder-suggestions?userId=${userId}`),
      ]);
      const listData = await listRes.json();
      const sugData = await sugRes.json();
      if (listRes.ok && listData.success) {
        setItems(listData.items || []);
        setOrdersEnabled(!!listData.orders_enabled);
      } else {
        setError((typeof listData.detail === 'string' && listData.detail) || 'Could not load stock.');
      }
      if (sugRes.ok && sugData.success) setSuggestions(sugData.suggestions || []);
    } catch (err) {
      console.error('Fetch stock error:', err);
      setError('Network error. Try again.');
    } finally {
      setLoading(false);
    }
  }, [projectId, userId]);

  useEffect(() => { fetchList(); }, [fetchList]);

  const openDetail = useCallback(async (itemId) => {
    setSelectedId(itemId);
    setDetail(null);
    setTransactions([]);
    try {
      const res = await fetch(`${API_BASE_URL}/api/stock/${itemId}?userId=${userId}`);
      const data = await res.json();
      if (res.ok && data.success) { setDetail(data.item); setTransactions(data.transactions || []); }
    } catch (err) { console.error('Fetch item detail error:', err); }
  }, [userId]);

  const closeDetail = () => { setSelectedId(null); setDetail(null); setTransactions([]); };

  const deleteItem = async () => {
    if (!window.confirm(`Delete "${detail.name}" and its whole transaction ledger?`)) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/stock/${detail.id}?userId=${userId}`, { method: 'DELETE' });
      const data = await res.json();
      if (res.ok && data.success) { closeDetail(); fetchList(); }
      else alert((typeof data.detail === 'string' && data.detail) || 'Could not delete the item.');
    } catch (err) { console.error('Delete item error:', err); }
  };

  if (stockLocked) {
    return (
      <div className="stock-app">
        <ModuleLockedNotice
          moduleName="POMAR Stock"
          companyName={user?.company}
          variant="upgrade"
          icon="📦"
          description="Track on-site inventory and get reorder alerts when materials run low. Upgrade your plan to unlock Stock."
        />
      </div>
    );
  }

  const renderDetail = () => {
    if (!detail) return <p className="stock-muted">Loading item…</p>;
    const dot = statusDot(detail.stock_status);
    return (
      <div className="stock-detail">
        <div className="stock-detail-head">
          <div>
            <h2 className="stock-detail-title">{detail.name}</h2>
            <div className="stock-detail-onhand">
              <span className={`stock-dot ${dot.className}`} />
              {formatQty(detail.on_hand)} {detail.unit || ''}
            </div>
            <div className="stock-muted">{dot.label}</div>
          </div>
          {canWrite && (
            <button className="stock-link-btn" onClick={() => setEditingItem(detail)}>Edit</button>
          )}
        </div>

        <div className="stock-detail-grid">
          <div>
            <div className="stock-detail-label">Reorder threshold</div>
            <div className="stock-detail-value">{formatQty(detail.reorder_threshold)} {detail.unit || ''}</div>
          </div>
          <div>
            <div className="stock-detail-label">Reorder quantity</div>
            <div className="stock-detail-value">{formatQty(detail.reorder_qty)} {detail.unit || ''}</div>
          </div>
          <div>
            <div className="stock-detail-label">Last known unit cost</div>
            <div className="stock-detail-value">{formatCurrency(detail.last_known_unit_cost)}</div>
          </div>
          <div>
            <div className="stock-detail-label">Needs reorder</div>
            <div className="stock-detail-value">{detail.needs_reorder ? 'Yes' : 'No'}</div>
          </div>
        </div>

        {detail.needs_reorder && (
          <div className="stock-reorder-card">
            <h3>Reorder suggested</h3>
            <p className="stock-muted">
              On hand {formatQty(detail.on_hand)} is below the reorder point of {formatQty(detail.reorder_threshold)}.
              Suggested: {formatQty(detail.reorder_qty)} {detail.unit || 'units'} at {formatCurrency(detail.last_known_unit_cost)} each
              &nbsp;=&nbsp;{formatCurrency(Number(detail.reorder_qty) * Number(detail.last_known_unit_cost))}.
            </p>
            {ordersEnabled && canWrite && (
              <a
                className="stock-btn-primary"
                style={{ display: 'inline-block', textDecoration: 'none' }}
                href={createOrderHref({
                  name: detail.name,
                  unit: detail.unit,
                  suggested_qty: detail.reorder_qty,
                  suggested_unit_cost: detail.last_known_unit_cost,
                })}
              >
                Create Order
              </a>
            )}
          </div>
        )}

        <div className="stock-ledger-title">Transaction ledger</div>
        {transactions.length === 0 ? (
          <p className="stock-muted">No transactions yet. On-hand is 0.</p>
        ) : (
          <table className="stock-ledger-table">
            <thead>
              <tr><th>When</th><th>Type</th><th className="stock-num">Qty</th><th>Source</th><th>By</th><th>Notes</th></tr>
            </thead>
            <tbody>
              {transactions.map((t) => {
                const m = txnMeta(t.type);
                return (
                  <tr key={t.id}>
                    <td>{formatDateTime(t.created_at)}</td>
                    <td><span className={`stock-txn-tag ${m.className}`}>{m.label}</span></td>
                    <td className="stock-num">
                      {t.type === 'adjustment'
                        ? (Number(t.qty) >= 0 ? '+' : '−') + formatQty(Math.abs(Number(t.qty)))
                        : m.sign + formatQty(Math.abs(Number(t.qty)))}
                    </td>
                    <td>{t.source_order_id ? `Order #${t.source_order_id}` : 'Manual'}</td>
                    <td>{t.logged_by_name || '—'}</td>
                    <td>{t.notes || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {canWrite && (
          <div className="stock-detail-actions">
            <button className="stock-btn-primary" onClick={() => setShowTxnForm(true)}>Log transaction</button>
            <button className="stock-btn-danger" onClick={deleteItem}>Delete item</button>
          </div>
        )}

        {showTxnForm && (
          <LogTransactionForm
            userId={userId}
            item={detail}
            onSaved={(data) => { setShowTxnForm(false); setDetail(data.item); setTransactions(data.transactions || []); fetchList(); }}
            onCancel={() => setShowTxnForm(false)}
          />
        )}
      </div>
    );
  };

  return (
    <div className="stock-app">
      <div className="stock-container">
        <PageHeader
          backLabel={selectedId ? 'Back to stock' : `Back to ${selectedProject?.name || 'Project'}`}
          backHref={selectedId ? undefined : (user?.new_nav_enabled ? '/project' : undefined)}
          onBack={selectedId ? closeDetail : undefined}
          title={selectedId ? 'Item detail' : 'Stock'}
          actionLabel={!selectedId && canWrite ? '+ New item' : undefined}
          onAction={() => setShowItemForm(true)}
          actionDisabled={!selectedProject}
          actionTitle={!selectedProject ? 'Select a project from the header first' : undefined}
        />

        {!selectedProject ? (
          <p className="stock-muted">Select a project from the header to view its inventory.</p>
        ) : selectedId ? (
          renderDetail()
        ) : (
          <>
            {error && <div className="stock-error">{error}</div>}

            {suggestions.length > 0 && (
              <div className="stock-reorder-card">
                <h3>Reorder suggestions ({suggestions.length})</h3>
                <p className="stock-muted">Items below their reorder threshold.</p>
                {suggestions.map((s) => (
                  <div className="stock-reorder-row" key={s.inventory_item_id}>
                    <span className="stock-reorder-name">{s.name}</span>
                    <span className="stock-reorder-meta">
                      on hand {formatQty(s.on_hand)} · suggest {formatQty(s.suggested_qty)} {s.unit || ''} · {formatCurrency(s.suggested_cost)}
                    </span>
                    {ordersEnabled && canWrite && (
                      <a className="stock-link-btn" href={createOrderHref(s)}>Create Order →</a>
                    )}
                  </div>
                ))}
              </div>
            )}

            {loading ? (
              <p className="stock-muted">Loading stock…</p>
            ) : items.length === 0 ? (
              <p className="stock-muted">No inventory items yet.{canWrite ? ' Add one to get started.' : ''}</p>
            ) : (
              <div className="stock-table-wrapper">
                <table className="stock-table">
                  <thead>
                    <tr>
                      <th></th>
                      <th>Item</th>
                      <th className="stock-num">On hand</th>
                      <th>Unit</th>
                      <th className="stock-num">Reorder at</th>
                      <th className="stock-num">Unit cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((it) => {
                      const dot = statusDot(it.stock_status);
                      return (
                        <tr key={it.id} onClick={() => openDetail(it.id)}>
                          <td><span className={`stock-dot ${dot.className}`} title={dot.label} /></td>
                          <td>{it.name}</td>
                          <td className="stock-num">{formatQty(it.on_hand)}</td>
                          <td>{it.unit || '—'}</td>
                          <td className="stock-num">{formatQty(it.reorder_threshold)}</td>
                          <td className="stock-num">{formatCurrency(it.last_known_unit_cost)}</td>
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

      {showItemForm && selectedProject && (
        <InventoryItemForm
          userId={userId}
          projectId={selectedProject.id}
          onSaved={() => { setShowItemForm(false); fetchList(); }}
          onCancel={() => setShowItemForm(false)}
        />
      )}
      {editingItem && (
        <InventoryItemForm
          userId={userId}
          projectId={selectedProject?.id}
          item={editingItem}
          onSaved={(saved) => { setEditingItem(null); fetchList(); if (saved?.id === selectedId) openDetail(saved.id); }}
          onCancel={() => setEditingItem(null)}
        />
      )}
    </div>
  );
}
