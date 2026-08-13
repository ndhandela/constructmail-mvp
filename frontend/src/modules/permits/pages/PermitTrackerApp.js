import React, { useContext, useState, useEffect, useCallback } from 'react';
import ModuleLockedNotice, { isModuleLocked } from '../../../components/ModuleLockedNotice';
import PageHeader from '../../../components/PageHeader';
import { ProjectContext, ALL_PROJECTS } from '../../../contexts/ProjectContext';
import { API_BASE_URL, formatDate, statusMeta } from '../permitsUtils';
import PermitForm from '../components/PermitForm';
import ManagePermitAccessModal from '../components/ManagePermitAccessModal';
import PermitSettingsModal from '../components/PermitSettingsModal';
import '../styles/PermitTrackerApp.css';

const STATUS_FILTER_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'active', label: 'Active' },
  { value: 'expiring_soon', label: 'Expiring Soon' },
  { value: 'expired', label: 'Expired' },
];

// Project selection comes from the shared header/sidebar switcher, same as
// Invoice Tracker/Documents — no separate in-page picker. Status
// (Active/Expiring Soon/Expired) is never computed here — every permit the
// API returns already carries the server-computed `status`, since a client
// is never trusted to derive it (see fastapi_backend/services/permit_helpers.py).
export default function PermitTrackerApp({ user, userId }) {
  const permitsLocked = isModuleLocked(user?.active_modules, 'permits', user?.account_status);
  const { projects, currentProjectId } = useContext(ProjectContext);
  const selectedProject = currentProjectId !== ALL_PROJECTS
    ? projects.find((p) => String(p.id) === String(currentProjectId))
    : null;

  const [permits, setPermits] = useState([]);
  const [subCompanies, setSubCompanies] = useState([]);
  const [canWrite, setCanWrite] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const [showForm, setShowForm] = useState(false);
  const [editingPermit, setEditingPermit] = useState(null);
  const [managingPermit, setManagingPermit] = useState(null);
  const [showSettings, setShowSettings] = useState(false);

  const fetchPermits = useCallback(async () => {
    if (currentProjectId === ALL_PROJECTS) {
      setPermits([]);
      setCanWrite(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE_URL}/api/permits?project_id=${currentProjectId}&userId=${userId}`);
      const data = await res.json();
      if (data.success) {
        setPermits(data.permits || []);
        setCanWrite(!!data.can_write);
        setSubCompanies(data.sub_companies || []);
      } else {
        setError(data.detail || 'Could not load permits.');
      }
    } catch (err) {
      console.error('Fetch permits error:', err);
      setError('Network error. Try again.');
    } finally {
      setLoading(false);
    }
  }, [userId, currentProjectId]);

  useEffect(() => { fetchPermits(); }, [fetchPermits]);

  // Keeps an open manage-access modal in sync with fresh grants after a
  // grant/revoke triggers a refetch, same reasoning as
  // modules/documents/pages/DocumentsApp.js.
  useEffect(() => {
    if (!managingPermit) return;
    const updated = permits.find((p) => p.id === managingPermit.id);
    if (updated) setManagingPermit(updated);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permits]);

  const handleViewFile = async (permit) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/documents/${permit.document_id}/download?userId=${userId}`);
      const data = await res.json();
      if (data.success) window.open(data.url, '_blank', 'noopener');
    } catch (err) {
      console.error('Download permit file error:', err);
    }
  };

  const handleDelete = async (permit) => {
    if (!window.confirm(`Delete the ${permit.permit_type} permit?`)) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/permits/${permit.id}?userId=${userId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) fetchPermits();
    } catch (err) {
      console.error('Delete permit error:', err);
    }
  };

  const visiblePermits = statusFilter
    ? permits.filter((p) => p.status === statusFilter)
    : permits;

  if (permitsLocked) {
    return (
      <div className="permits-app">
        <ModuleLockedNotice
          moduleName="POMAR Permit Tracker"
          companyName={user?.company}
          variant="upgrade"
          icon="📋"
          description="Track permit expirations across your projects, with automatic Active/Expiring Soon/Expired status. Upgrade your plan to unlock Permit Tracker."
        />
      </div>
    );
  }

  return (
    <div className="permits-app">
      <div className="permits-container">
        <PageHeader
          backLabel={`Back to ${selectedProject?.name || 'Project'}`}
          backHref={user?.new_nav_enabled ? '/project' : undefined}
          title="Permits"
          actionLabel={canWrite ? '+ Add permit' : undefined}
          onAction={() => setShowForm(true)}
          actionDisabled={currentProjectId === ALL_PROJECTS}
          actionTitle={currentProjectId === ALL_PROJECTS ? 'Select a project from the header to add a permit' : undefined}
        />

        {currentProjectId === ALL_PROJECTS ? (
          <p className="permits-muted">Select a project from the header to view its permits.</p>
        ) : (
          <>
            <div className="permits-toolbar">
              <div className="permits-filters">
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                  {STATUS_FILTER_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              {canWrite && (
                <button type="button" className="permits-link-btn" onClick={() => setShowSettings(true)}>
                  Expiring-soon settings
                </button>
              )}
            </div>

            {error && <div className="permits-error">{error}</div>}

            {loading ? (
              <p className="permits-muted">Loading permits…</p>
            ) : visiblePermits.length === 0 ? (
              <p className="permits-muted">
                {permits.length === 0
                  ? `No permits yet.${canWrite ? ' Add one to get started.' : ''}`
                  : 'No permits match that status.'}
              </p>
            ) : (
              <div className="permits-table-wrapper">
                <table className="permits-table">
                  <thead>
                    <tr>
                      <th>Type</th>
                      <th>Permit #</th>
                      <th>Issuing Authority</th>
                      <th>Issue Date</th>
                      <th>Expiration Date</th>
                      <th>Status</th>
                      <th>File</th>
                      <th>Notes</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {visiblePermits.map((permit) => {
                      const meta = statusMeta(permit.status);
                      return (
                        <tr key={permit.id}>
                          <td>{permit.permit_type}</td>
                          <td>{permit.permit_number || '—'}</td>
                          <td>{permit.issuing_authority || '—'}</td>
                          <td>{formatDate(permit.issue_date)}</td>
                          <td>{formatDate(permit.expiration_date)}</td>
                          <td>
                            <span className={`permits-status-pill ${meta.className}`}>{meta.label}</span>
                          </td>
                          <td>
                            {permit.document_id ? (
                              <button className="permits-link-btn" onClick={() => handleViewFile(permit)}>View</button>
                            ) : '—'}
                          </td>
                          <td className="permits-notes-cell">{permit.notes || '—'}</td>
                          <td className="permits-row-actions">
                            {canWrite && (
                              <>
                                <button className="permits-link-btn" onClick={() => setEditingPermit(permit)}>Edit</button>
                                <button className="permits-link-btn" onClick={() => setManagingPermit(permit)}>Manage access</button>
                                <button className="permits-link-btn permits-link-btn-danger" onClick={() => handleDelete(permit)}>Delete</button>
                              </>
                            )}
                          </td>
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
        <PermitForm
          userId={userId}
          projectId={selectedProject.id}
          onSaved={() => { setShowForm(false); fetchPermits(); }}
          onCancel={() => setShowForm(false)}
        />
      )}
      {editingPermit && (
        <PermitForm
          userId={userId}
          projectId={editingPermit.project_id}
          permit={editingPermit}
          onSaved={() => { setEditingPermit(null); fetchPermits(); }}
          onCancel={() => setEditingPermit(null)}
        />
      )}
      {managingPermit && (
        <ManagePermitAccessModal
          permit={managingPermit}
          subCompanies={subCompanies}
          userId={userId}
          onChanged={fetchPermits}
          onClose={() => setManagingPermit(null)}
        />
      )}
      {showSettings && selectedProject && (
        <PermitSettingsModal
          userId={userId}
          projectId={selectedProject.id}
          onClose={() => { setShowSettings(false); fetchPermits(); }}
        />
      )}
    </div>
  );
}
