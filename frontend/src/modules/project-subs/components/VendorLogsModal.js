import React from 'react';
import DailyLogsList from '../../daily-logs/pages/DailyLogsList';

export default function VendorLogsModal({ userId, user, project, vendor, onClose }) {
  return (
    <div className="dailylogs-modal-overlay" onClick={onClose}>
      <div className="dailylogs-modal dailylogs-modal-wide" onClick={(e) => e.stopPropagation()}>
        <h3>{vendor.vendor_name || vendor.vendor_email}'s logs</h3>
        <DailyLogsList
          userId={userId}
          user={user}
          project={project}
          loggedByUserId={vendor.vendor_user_id}
          readOnly
        />
        <div className="dailylogs-form-actions">
          <button className="dailylogs-btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
