import React, { useContext, useState, useEffect, useCallback } from 'react';
import ModuleLockedNotice, { isModuleLocked } from '../../../components/ModuleLockedNotice';
import { ProjectContext, ALL_PROJECTS } from '../../../contexts/ProjectContext';
import { API_BASE_URL, formatFileSize, formatDate } from '../documentsUtils';
import DocumentUploadForm from '../components/DocumentUploadForm';
import ManageAccessModal from '../components/ManageAccessModal';
import '../styles/DocumentsApp.css';

// Project selection comes from the shared header/sidebar switcher (same
// pattern as Capital Tracker/Daily Logs/Invoice Tracker) — no separate
// in-page picker, and the upload modal takes projectId as a fixed prop.
export default function DocumentsApp({ user, userId }) {
  const documentsLocked = isModuleLocked(user?.active_modules, 'documents');
  const { projects, currentProjectId } = useContext(ProjectContext);
  const selectedProject = currentProjectId !== ALL_PROJECTS
    ? projects.find((p) => String(p.id) === String(currentProjectId))
    : null;

  const [documents, setDocuments] = useState([]);
  const [subCompanies, setSubCompanies] = useState([]);
  const [accessKind, setAccessKind] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [managingDocument, setManagingDocument] = useState(null);

  const fetchDocuments = useCallback(async () => {
    if (currentProjectId === ALL_PROJECTS) {
      setDocuments([]);
      setSubCompanies([]);
      setAccessKind(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE_URL}/api/documents?project_id=${currentProjectId}&userId=${userId}`);
      const data = await res.json();
      if (data.success) {
        setDocuments(data.documents || []);
        setSubCompanies(data.sub_companies || []);
        setAccessKind(data.access_kind);
      } else {
        setError(data.detail || 'Could not load documents.');
      }
    } catch (err) {
      console.error('Fetch documents error:', err);
      setError('Network error. Try again.');
    } finally {
      setLoading(false);
    }
  }, [userId, currentProjectId]);

  useEffect(() => { fetchDocuments(); }, [fetchDocuments]);

  // Keeps the open manage-access modal in sync with fresh grants after a
  // grant/revoke triggers a refetch, instead of closing it on every action —
  // a GC granting several Sub companies in one sitting shouldn't have to
  // reopen the modal each time.
  useEffect(() => {
    if (!managingDocument) return;
    const updated = documents.find((d) => d.id === managingDocument.id);
    if (updated) setManagingDocument(updated);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documents]);

  const handleDownload = async (doc) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/documents/${doc.id}/download?userId=${userId}`);
      const data = await res.json();
      if (data.success) window.open(data.url, '_blank', 'noopener');
    } catch (err) {
      console.error('Download document error:', err);
    }
  };

  const handleDelete = async (doc) => {
    if (!window.confirm(`Delete "${doc.filename}"?`)) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/documents/${doc.id}?userId=${userId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) fetchDocuments();
    } catch (err) {
      console.error('Delete document error:', err);
    }
  };

  const canDelete = (doc) => accessKind === 'gc' || doc.uploaded_by_user_id === Number(userId);

  if (documentsLocked) {
    return (
      <div className="documents-app">
        <ModuleLockedNotice
          moduleName="POMAR Documents"
          companyName={user?.company}
          variant="upgrade"
          icon="📁"
          description="Share contracts, drawings, and submittals with your Subs in one place. Upgrade your plan to unlock Documents."
        />
      </div>
    );
  }

  return (
    <div className="documents-app">
      <div className="documents-hero">
        <div className="documents-badge">POMAR DOCUMENTS</div>
        <h1>Project documents, shared safely</h1>
        <p>Upload contracts, drawings, and submittals against a project, and control exactly which Sub companies can see them.</p>
      </div>

      <div className="documents-container">
        <div className="documents-toolbar">
          <div />
          <button
            className="documents-btn-primary"
            onClick={() => setShowForm(true)}
            disabled={currentProjectId === ALL_PROJECTS}
            title={currentProjectId === ALL_PROJECTS ? 'Select a project from the header to upload a document' : undefined}
          >
            + Upload document
          </button>
        </div>

        {error && <div className="documents-error">{error}</div>}

        {currentProjectId === ALL_PROJECTS ? (
          <p className="documents-muted">Select a project from the header to view its documents.</p>
        ) : loading ? (
          <p className="documents-muted">Loading documents…</p>
        ) : documents.length === 0 ? (
          <p className="documents-muted">No documents yet. Upload one to get started.</p>
        ) : (
          <div className="documents-table-wrapper">
            <table className="documents-table">
              <thead>
                <tr>
                  <th>Filename</th>
                  <th>Category</th>
                  <th>Uploaded By</th>
                  <th>Size</th>
                  <th>Upload Date</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {documents.map((doc) => (
                  <tr key={doc.id}>
                    <td>{doc.filename}</td>
                    <td>{doc.category || '—'}</td>
                    <td>{doc.uploaded_by_name} <span className="documents-muted-inline">({doc.uploader_company_name})</span></td>
                    <td>{formatFileSize(doc.size_bytes)}</td>
                    <td>{formatDate(doc.created_at)}</td>
                    <td className="documents-row-actions">
                      <button className="documents-link-btn" onClick={() => handleDownload(doc)}>Download</button>
                      {accessKind === 'gc' && (
                        <button className="documents-link-btn" onClick={() => setManagingDocument(doc)}>Manage access</button>
                      )}
                      {canDelete(doc) && (
                        <button className="documents-link-btn documents-link-btn-danger" onClick={() => handleDelete(doc)}>Delete</button>
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
        <DocumentUploadForm
          userId={userId}
          projectId={selectedProject.id}
          onSaved={() => { setShowForm(false); fetchDocuments(); }}
          onCancel={() => setShowForm(false)}
        />
      )}

      {managingDocument && (
        <ManageAccessModal
          document={managingDocument}
          subCompanies={subCompanies}
          userId={userId}
          onChanged={fetchDocuments}
          onClose={() => setManagingDocument(null)}
        />
      )}
    </div>
  );
}
