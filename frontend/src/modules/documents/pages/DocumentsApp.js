import React, { useContext, useState, useEffect, useCallback } from 'react';
import ModuleLockedNotice, { isModuleLocked } from '../../../components/ModuleLockedNotice';
import PageHeader from '../../../components/PageHeader';
import { ProjectContext, ALL_PROJECTS } from '../../../contexts/ProjectContext';
import { API_BASE_URL, formatFileSize, formatDate } from '../documentsUtils';
import DocumentUploadForm from '../components/DocumentUploadForm';
import ManageAccessModal from '../components/ManageAccessModal';
import NewFolderModal from '../components/NewFolderModal';
import FolderAccessModal from '../components/FolderAccessModal';
import '../styles/DocumentsApp.css';

// Project selection comes from the shared header/sidebar switcher (same
// pattern as Capital Tracker/Daily Logs/Invoice Tracker) — no separate
// in-page picker, and the upload modal takes projectId as a fixed prop.
//
// Folders are single-level (no nesting): currentFolderId is either null
// (project root — the original, pre-folders document view, unchanged) or
// one folder's id. accessKind ("gc" | "sub") comes straight from the
// backend's per-project resolution — a Sub company that owns its own
// project shows up as "gc" there for free, so the "New Folder" button and
// folder-access controls need no special-cased "Sub-turned-GC" logic here.
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

  const [folders, setFolders] = useState([]);
  const [currentFolderId, setCurrentFolderId] = useState(null);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [managingFolder, setManagingFolder] = useState(null);

  const currentFolder = currentFolderId != null
    ? folders.find((f) => f.id === currentFolderId)
    : null;

  // A folder no longer visible (e.g. its access was just revoked) shouldn't
  // leave the view stuck pointed at it — fall back to root.
  useEffect(() => {
    if (currentFolderId != null && !currentFolder) setCurrentFolderId(null);
  }, [currentFolderId, currentFolder]);

  useEffect(() => { setCurrentFolderId(null); }, [currentProjectId]);

  const fetchFolders = useCallback(async () => {
    if (currentProjectId === ALL_PROJECTS) {
      setFolders([]);
      return;
    }
    try {
      const res = await fetch(`${API_BASE_URL}/api/documents/projects/${currentProjectId}/folders?userId=${userId}`);
      const data = await res.json();
      if (data.success) {
        setFolders(data.folders || []);
        setAccessKind(data.access_kind);
        setSubCompanies(data.sub_companies || []);
      }
    } catch (err) {
      console.error('Fetch folders error:', err);
    }
  }, [userId, currentProjectId]);

  useEffect(() => { fetchFolders(); }, [fetchFolders]);

  // Keeps an open manage-folder-access modal in sync with fresh grants
  // after a grant/revoke triggers a refetch, same reasoning as the
  // documents effect below.
  useEffect(() => {
    if (!managingFolder) return;
    const updated = folders.find((f) => f.id === managingFolder.id);
    if (updated) setManagingFolder(updated);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folders]);

  const fetchDocuments = useCallback(async () => {
    if (currentProjectId === ALL_PROJECTS) {
      setDocuments([]);
      setAccessKind(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ project_id: currentProjectId, userId });
      if (currentFolderId != null) params.set('folder_id', currentFolderId);
      const res = await fetch(`${API_BASE_URL}/api/documents?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setDocuments(data.documents || []);
        setAccessKind(data.access_kind);
        if (currentFolderId == null) setSubCompanies(data.sub_companies || []);
      } else {
        setError(data.detail || 'Could not load documents.');
      }
    } catch (err) {
      console.error('Fetch documents error:', err);
      setError('Network error. Try again.');
    } finally {
      setLoading(false);
    }
  }, [userId, currentProjectId, currentFolderId]);

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
      <div className="documents-container">
        <PageHeader
          backLabel={`Back to ${selectedProject?.name || 'Project'}`}
          backHref={user?.new_nav_enabled ? '/project' : undefined}
          title="Documents"
          actionLabel="+ Upload document"
          onAction={() => setShowForm(true)}
          actionDisabled={currentProjectId === ALL_PROJECTS}
          actionTitle={currentProjectId === ALL_PROJECTS ? 'Select a project from the header to upload a document' : undefined}
        />

        {currentProjectId === ALL_PROJECTS ? (
          <p className="documents-muted">Select a project from the header to view its documents.</p>
        ) : (
          <div className="documents-layout">
            <aside className="documents-folder-sidebar">
              <div className="documents-folder-sidebar-header">
                <span>Folders</span>
                {accessKind === 'gc' && (
                  <button className="documents-link-btn" onClick={() => setShowNewFolder(true)}>+ New</button>
                )}
              </div>
              <ul className="documents-folder-list">
                <li>
                  <button
                    className={`documents-folder-item ${currentFolderId == null ? 'active' : ''}`}
                    onClick={() => setCurrentFolderId(null)}
                  >
                    Root
                  </button>
                </li>
                {folders.map((f) => (
                  <li key={f.id}>
                    <button
                      className={`documents-folder-item ${currentFolderId === f.id ? 'active' : ''}`}
                      onClick={() => setCurrentFolderId(f.id)}
                    >
                      {f.name}
                    </button>
                  </li>
                ))}
                {folders.length === 0 && (
                  <li className="documents-muted documents-folder-empty">No folders yet.</li>
                )}
              </ul>
            </aside>

            <div className="documents-main">
              <div className="documents-toolbar">
                <div className="documents-current-folder">
                  {currentFolder ? (
                    <>
                      <strong>{currentFolder.name}</strong>
                      {accessKind === 'gc' && (
                        <button className="documents-link-btn" onClick={() => setManagingFolder(currentFolder)}>
                          Manage access
                        </button>
                      )}
                    </>
                  ) : (
                    <strong>Root</strong>
                  )}
                </div>
              </div>

              {error && <div className="documents-error">{error}</div>}

              {loading ? (
                <p className="documents-muted">Loading documents…</p>
              ) : documents.length === 0 ? (
                <p className="documents-muted">No documents here yet. Upload one to get started.</p>
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
                            {accessKind === 'gc' && doc.folder_id == null && (
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
          </div>
        )}
      </div>

      {showForm && selectedProject && (
        <DocumentUploadForm
          userId={userId}
          projectId={selectedProject.id}
          folderId={currentFolderId}
          folderName={currentFolder?.name}
          onSaved={() => { setShowForm(false); fetchDocuments(); }}
          onCancel={() => setShowForm(false)}
        />
      )}

      {showNewFolder && selectedProject && (
        <NewFolderModal
          userId={userId}
          projectId={selectedProject.id}
          onSaved={(folder) => { setShowNewFolder(false); fetchFolders(); setCurrentFolderId(folder.id); }}
          onCancel={() => setShowNewFolder(false)}
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

      {managingFolder && (
        <FolderAccessModal
          folder={managingFolder}
          subCompanies={subCompanies}
          userId={userId}
          onChanged={fetchFolders}
          onClose={() => setManagingFolder(null)}
        />
      )}
    </div>
  );
}
