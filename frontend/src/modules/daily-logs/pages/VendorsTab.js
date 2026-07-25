import React, { useState, useEffect, useCallback } from 'react';
import { API_BASE_URL } from '../dailyLogsUtils';
import VendorAccessTable from './VendorAccessTable';
import InviteVendorModal from './InviteVendorModal';
import VendorLogsModal from './VendorLogsModal';

export default function VendorsTab({ userId, user, project }) {
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [viewingLogsFor, setViewingLogsFor] = useState(null);

  const fetchVendors = useCallback(async () => {
    if (!project) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/project-vendors/projects/${project.id}/vendors?userId=${userId}`);
      const data = await res.json();
      if (data.success) setVendors(data.vendors || []);
    } catch (err) {
      console.error('Fetch project vendors error:', err);
    } finally {
      setLoading(false);
    }
  }, [project, userId]);

  useEffect(() => { fetchVendors(); }, [fetchVendors]);

  const handleInvited = () => {
    setShowInviteModal(false);
    fetchVendors();
  };

  const handleRemove = async (accessId) => {
    if (!window.confirm('Remove this vendor\'s access to this project? Their existing logs stay visible to you.')) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/project-vendors/${accessId}/remove?userId=${userId}`, {
        method: 'POST',
      });
      if (res.ok) fetchVendors();
    } catch (err) {
      console.error('Remove vendor error:', err);
    }
  };

  const handleReinvite = async (accessId) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/project-vendors/${accessId}/reinvite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: Number(userId) }),
      });
      if (res.ok) fetchVendors();
    } catch (err) {
      console.error('Reinvite vendor error:', err);
    }
  };

  return (
    <div className="dailylogs-tab-panel">
      <div className="dailylogs-dashboard-header">
        <h2>Vendors</h2>
        <button className="dailylogs-btn-primary" onClick={() => setShowInviteModal(true)}>+ Invite vendor</button>
      </div>

      {loading ? (
        <p className="dailylogs-muted">Loading vendors…</p>
      ) : vendors.length === 0 ? (
        <p className="dailylogs-muted">No vendors invited yet. Invite a sub to let them log site work on this project.</p>
      ) : (
        <VendorAccessTable
          vendors={vendors}
          onRemove={handleRemove}
          onReinvite={handleReinvite}
          onViewLogs={setViewingLogsFor}
        />
      )}

      {showInviteModal && (
        <InviteVendorModal
          userId={userId}
          project={project}
          onInvited={handleInvited}
          onCancel={() => setShowInviteModal(false)}
        />
      )}

      {viewingLogsFor && (
        <VendorLogsModal
          userId={userId}
          user={user}
          project={project}
          vendor={viewingLogsFor}
          onClose={() => setViewingLogsFor(null)}
        />
      )}
    </div>
  );
}
