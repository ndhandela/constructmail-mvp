import React from 'react';
import { formatDate } from '../dailyLogsUtils';

function statusBadge(vendor) {
  if (vendor.status === 'invited') return { label: 'Invited', className: 'dailylogs-status-invited' };
  if (vendor.status === 'removed') return { label: 'Removed', className: 'dailylogs-status-removed' };
  if (vendor.is_stale) return { label: 'Stale', className: 'dailylogs-status-stale' };
  return { label: 'Active', className: 'dailylogs-status-active' };
}

export default function VendorAccessTable({ vendors, onRemove, onReinvite, onViewLogs }) {
  return (
    <div className="dailylogs-table-wrapper">
      <table className="dailylogs-table">
        <thead>
          <tr>
            <th>Vendor</th>
            <th>Trade</th>
            <th>Status</th>
            <th>Last log</th>
            <th>Logs (7d)</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {vendors.map((vendor) => {
            const badge = statusBadge(vendor);
            return (
              <tr key={vendor.access_id}>
                <td>
                  <div className="dailylogs-vendor-name">{vendor.vendor_name || vendor.vendor_email}</div>
                  <div className="dailylogs-vendor-email">{vendor.vendor_email}</div>
                </td>
                <td>{vendor.role || '—'}</td>
                <td>
                  <span className={`dailylogs-status-badge ${badge.className}`}>{badge.label}</span>
                </td>
                <td>{vendor.last_log_date ? formatDate(vendor.last_log_date) : '—'}</td>
                <td>{vendor.logs_last_7d}</td>
                <td className="dailylogs-vendor-actions">
                  {vendor.status === 'accepted' && (
                    <button
                      className="dailylogs-icon-btn"
                      title="View logs"
                      onClick={() => onViewLogs(vendor)}
                    >
                      👁
                    </button>
                  )}
                  {(vendor.status === 'invited' || vendor.status === 'accepted') && (
                    <button
                      className="dailylogs-icon-btn"
                      title={vendor.status === 'invited' ? 'Cancel invite' : 'Remove access'}
                      onClick={() => onRemove(vendor.access_id)}
                    >
                      ✕
                    </button>
                  )}
                  {vendor.status === 'removed' && (
                    <button
                      className="dailylogs-icon-btn"
                      title="Reinvite"
                      onClick={() => onReinvite(vendor.access_id)}
                    >
                      ↻
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
