import React, { useState, useEffect, useContext, useRef, useCallback } from 'react';
import { ProjectContext } from '../contexts/ProjectContext';
import { useUnsavedChanges } from '../contexts/UnsavedChangesContext';
import '../styles/ProjectsEditPage.css';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

// Values must match PROJECT_STATUSES in fastapi_backend/routers/projects.py.
const STATUS_OPTIONS = [
  { value: 'planning', label: 'Planning' },
  { value: 'active', label: 'Active' },
  { value: 'on_hold', label: 'On Hold' },
  { value: 'completed', label: 'Completed' },
];

function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] || '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase();
}

export default function ProjectsEditPage({ projectId, section, userId, user, onBack }) {
  const { projects, refreshProjects } = useContext(ProjectContext);
  const { setDirty, registerSaveHandler, guardNavigation } = useUnsavedChanges();

  const project = projects.find((p) => String(p.id) === String(projectId));

  const [form, setForm] = useState({
    name: '',
    status: 'active',
    location: '',
    start_date: '',
  });
  // "Owner" is derived from project_members.role='owner', not stored on
  // `form` — it's read-only on this page (see PUT /api/projects/{id} in
  // fastapi_backend/routers/projects.py for why: that role is what actually
  // gates permissions, e.g. POST /{project_id}/invite, so it isn't editable
  // as a plain text field here).
  const [ownerName, setOwnerName] = useState('');
  const [members, setMembers] = useState([]);
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [editingMemberId, setEditingMemberId] = useState(null);
  const [editDraft, setEditDraft] = useState({ role: '' });
  const [addingMember, setAddingMember] = useState(false);
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [newMemberRole, setNewMemberRole] = useState('contributor');
  const [saveNotice, setSaveNotice] = useState('');
  const [saveError, setSaveError] = useState('');

  const infoSectionRef = useRef(null);
  const teamSectionRef = useRef(null);

  // Prefills from server data — not a user edit, so this must not go through
  // handleFieldChange/setDirty below.
  useEffect(() => {
    if (project) {
      setForm({
        name: project.name || '',
        status: project.status || 'active',
        location: project.location || '',
        start_date: project.start_date || '',
      });
    }
  }, [project]);

  const fetchMembers = useCallback(() => {
    if (!projectId || !userId) return;
    setLoadingMembers(true);
    fetch(`${API_BASE_URL}/api/projects/${projectId}/members?userId=${userId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setMembers((data.members || []).map((m) => ({
            ...m,
            display_name: m.full_name || m.name || m.email,
          })));
          const owner = (data.members || []).find((m) => m.role === 'owner');
          setOwnerName(owner ? (owner.full_name || owner.name || owner.email) : '');
        }
      })
      .catch((err) => console.error('Fetch project members error:', err))
      .finally(() => setLoadingMembers(false));
  }, [projectId, userId]);

  useEffect(() => { fetchMembers(); }, [fetchMembers]);

  useEffect(() => {
    const target = section === 'team' ? teamSectionRef.current : infoSectionRef.current;
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [section]);

  const saveProjectInfo = useCallback(async () => {
    setSaveError('');
    try {
      const res = await fetch(`${API_BASE_URL}/api/projects/${projectId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: Number(userId),
          name: form.name.trim(),
          status: form.status,
          location: form.location.trim() || null,
          start_date: form.start_date || null,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.detail || 'Could not save project info');
      }
      setSaveNotice('Project info saved.');
      await refreshProjects(projectId);
    } catch (err) {
      console.error('Save project info error:', err);
      setSaveError(err.message || 'Could not reach the server. Please try again.');
      // Rethrown so the unsaved-changes guard's Save & Switch (which awaits
      // this handler) knows the save failed and keeps the dirty flag set
      // instead of navigating away on a failed save.
      throw err;
    }
  }, [projectId, userId, form, refreshProjects]);

  useEffect(() => {
    registerSaveHandler(saveProjectInfo);
    return () => registerSaveHandler(null);
  }, [saveProjectInfo, registerSaveHandler]);

  const handleFieldChange = (key, value) => {
    setForm((f) => ({ ...f, [key]: value }));
    setDirty(true, 'the project edit form');
  };

  const handleSaveClick = async (e) => {
    e.preventDefault();
    try {
      await saveProjectInfo();
      setDirty(false);
    } catch {
      // Error already surfaced via saveError; dirty flag stays set.
    }
  };

  const handleBack = () => {
    guardNavigation(() => { if (onBack) onBack(); });
  };

  const startEditMember = (m) => {
    setEditingMemberId(m.user_id);
    setEditDraft({ role: m.role });
    setDirty(true, 'a team member role change');
  };

  const cancelEditMember = () => {
    setEditingMemberId(null);
    setDirty(false);
  };

  const saveEditMember = async (userIdToEdit) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/projects/${projectId}/team/${userIdToEdit}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requesterId: Number(userId), role: editDraft.role }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.detail || 'Could not update team member');
      }
      setEditingMemberId(null);
      setDirty(false);
      setSaveNotice('Team member updated.');
      fetchMembers();
    } catch (err) {
      console.error('Update team member error:', err);
      alert(err.message || 'Could not reach the server. Please try again.');
      // Keep editing state + dirty flag so the user can retry or cancel.
    }
  };

  const removeMember = async (userIdToRemove) => {
    if (!window.confirm('Remove this team member from the project?')) return;
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/projects/${projectId}/team/${userIdToRemove}?requesterId=${userId}`,
        { method: 'DELETE' },
      );
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.detail || 'Could not remove team member');
      }
      setSaveNotice('Team member removed.');
      fetchMembers();
    } catch (err) {
      console.error('Remove team member error:', err);
      alert(err.message || 'Could not reach the server. Please try again.');
    }
  };

  const handleAddMember = async (e) => {
    e.preventDefault();
    if (!newMemberEmail.trim()) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/projects/${projectId}/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invitedBy: Number(userId),
          email: newMemberEmail.trim(),
          role: newMemberRole,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setNewMemberEmail('');
        setAddingMember(false);
        setDirty(false);
        fetchMembers();
      } else {
        alert(data.detail || 'Could not add team member');
      }
    } catch (err) {
      console.error('Add team member error:', err);
      alert('Could not reach the server. Please try again.');
    }
  };

  return (
    <div className="pep-container">
      <button className="pep-back-link" onClick={handleBack}>← Back to Your Tools</button>

      {saveNotice && (
        <div className="pep-notice">
          {saveNotice}
        </div>
      )}
      {saveError && (
        <div className="pep-notice pep-notice-error">
          {saveError}
        </div>
      )}

      <section ref={infoSectionRef} className="pep-card">
        <h2 className="pep-card-title">Project Info</h2>
        <form className="pep-field-grid" onSubmit={handleSaveClick}>
          <div className="pep-field">
            <label className="pep-label" htmlFor="pep-name">Project name</label>
            <input
              id="pep-name"
              className="pep-input"
              value={form.name}
              onChange={(e) => handleFieldChange('name', e.target.value)}
            />
          </div>

          <div className="pep-field">
            <label className="pep-label" htmlFor="pep-owner">Owner</label>
            <input
              id="pep-owner"
              className="pep-input"
              value={ownerName}
              disabled
              title="Ownership is transferred by changing a team member's role to owner, not edited here"
            />
          </div>

          <div className="pep-field">
            <label className="pep-label" htmlFor="pep-status">Status</label>
            <select
              id="pep-status"
              className="pep-input"
              value={form.status}
              onChange={(e) => handleFieldChange('status', e.target.value)}
            >
              {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>

          <div className="pep-field">
            <label className="pep-label" htmlFor="pep-location">Location</label>
            <input
              id="pep-location"
              className="pep-input"
              placeholder="e.g. Dallas, TX"
              value={form.location}
              onChange={(e) => handleFieldChange('location', e.target.value)}
            />
          </div>

          <div className="pep-field">
            <label className="pep-label" htmlFor="pep-start">Start date</label>
            <input
              id="pep-start"
              type="date"
              className="pep-input"
              value={form.start_date}
              onChange={(e) => handleFieldChange('start_date', e.target.value)}
            />
          </div>

          <div className="pep-field">
            <label className="pep-label" htmlFor="pep-company">Company</label>
            <input
              id="pep-company"
              className="pep-input"
              value={user?.company || ''}
              disabled
            />
          </div>

          <div className="pep-form-actions">
            <button type="submit" className="pep-save-btn">Save Changes</button>
          </div>
        </form>
      </section>

      <section ref={teamSectionRef} className="pep-card">
        <h2 className="pep-card-title">Team Members</h2>

        <div className="pep-team-list">
          {loadingMembers ? (
            <p className="pep-empty">Loading…</p>
          ) : members.length === 0 ? (
            <p className="pep-empty">No team members yet.</p>
          ) : (
            members.map((m) => (
              <div key={m.user_id} className="pep-team-row">
                <div className="pep-team-avatar">{getInitials(m.display_name)}</div>

                {editingMemberId === m.user_id ? (
                  // Name isn't editable here — it's the linked user account's
                  // name (users.full_name), shared across every project and
                  // their own Profile page, not per-project data. Only this
                  // project's role can be changed from this list.
                  <div className="pep-team-edit">
                    <div className="pep-team-info">
                      <div className="pep-team-name">{m.display_name}</div>
                    </div>
                    <select
                      className="pep-input pep-team-edit-input"
                      value={editDraft.role}
                      onChange={(e) => setEditDraft({ role: e.target.value })}
                    >
                      <option value="owner">owner</option>
                      <option value="contributor">contributor</option>
                      <option value="viewer">viewer</option>
                    </select>
                    <button className="pep-team-action-btn pep-save-inline" onClick={() => saveEditMember(m.user_id)}>Save</button>
                    <button className="pep-team-action-btn" onClick={cancelEditMember}>Cancel</button>
                  </div>
                ) : (
                  <>
                    <div className="pep-team-info">
                      <div className="pep-team-name">{m.display_name}</div>
                      <div className="pep-team-role">{m.role}</div>
                    </div>
                    <div className="pep-team-actions">
                      <button className="pep-team-action-btn" onClick={() => startEditMember(m)}>Edit</button>
                      <button className="pep-team-action-btn pep-remove-btn" onClick={() => removeMember(m.user_id)}>Remove</button>
                    </div>
                  </>
                )}
              </div>
            ))
          )}
        </div>

        {addingMember ? (
          <form className="pep-add-member-form" onSubmit={handleAddMember}>
            <input
              className="pep-input"
              type="email"
              placeholder="teammate@company.com"
              value={newMemberEmail}
              onChange={(e) => setNewMemberEmail(e.target.value)}
              required
            />
            <select
              className="pep-input"
              value={newMemberRole}
              onChange={(e) => setNewMemberRole(e.target.value)}
            >
              <option value="contributor">contributor</option>
              <option value="viewer">viewer</option>
            </select>
            <button type="submit" className="pep-save-btn">Send Invite</button>
            <button
              type="button"
              className="pep-team-action-btn"
              onClick={() => { setAddingMember(false); setDirty(false); }}
            >
              Cancel
            </button>
          </form>
        ) : (
          <button
            className="pep-add-member-btn"
            onClick={() => { setAddingMember(true); setDirty(true, 'a new team member invite'); }}
          >
            + Add Team Member
          </button>
        )}
      </section>
    </div>
  );
}
