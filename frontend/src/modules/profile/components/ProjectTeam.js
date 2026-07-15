import React, { useState, useEffect, useCallback, useContext } from 'react';
import { ProjectContext, ALL_PROJECTS } from '../../../contexts/ProjectContext';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

function memberDisplayName(m) {
  return m.full_name || m.name || m.email;
}

export default function ProjectTeam({ userId }) {
  const { projects, currentProjectId } = useContext(ProjectContext);
  const [members, setMembers] = useState([]);
  const [pendingInvites, setPendingInvites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('contributor');
  const [inviting, setInviting] = useState(false);
  const [msg, setMsg] = useState(null);

  const hasProject = currentProjectId && currentProjectId !== ALL_PROJECTS;
  const currentProject = projects.find((p) => String(p.id) === String(currentProjectId));
  const isOwner = currentProject?.member_role === 'owner';

  const fetchMembers = useCallback(async () => {
    if (!hasProject) {
      setMembers([]);
      setPendingInvites([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/projects/${currentProjectId}/members?userId=${userId}`);
      const data = await res.json();
      if (data.success) {
        setMembers(data.members || []);
        setPendingInvites(data.pending_invites || []);
      }
    } catch (err) {
      console.error('Fetch project members error:', err);
    } finally {
      setLoading(false);
    }
  }, [hasProject, currentProjectId, userId]);

  useEffect(() => { fetchMembers(); }, [fetchMembers]);

  const handleInvite = async (e) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setInviting(true);
    setMsg(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/projects/${currentProjectId}/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invitedBy: Number(userId),
          email: inviteEmail.trim(),
          role: inviteRole,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg({ type: 'error', text: data.detail || 'Could not send invite.' });
        return;
      }
      setMsg({
        type: 'success',
        text: data.status === 'added'
          ? `${inviteEmail} was added to the project.`
          : `Invite sent to ${inviteEmail}.`,
      });
      setInviteEmail('');
      fetchMembers();
    } catch (err) {
      console.error('Invite error:', err);
      setMsg({ type: 'error', text: 'Network error. Try again.' });
    } finally {
      setInviting(false);
    }
  };

  if (!hasProject) {
    return (
      <div className="profile-card">
        <p className="profile-readonly-note">
          Select a project in the header switcher to see and manage its team.
        </p>
      </div>
    );
  }

  if (loading) {
    return <div className="profile-card">Loading team…</div>;
  }

  return (
    <div className="profile-card">
      <p className="profile-section-title">Members of {currentProject?.name}</p>

      <div className="team-member-list">
        {members.map((m) => (
          <div className="team-member-row" key={m.user_id}>
            <div>
              <div className="team-member-name">{memberDisplayName(m)}</div>
              <div className="team-member-email">{m.email}</div>
            </div>
            <span className={`team-role-pill team-role-${m.role}`}>{m.role}</span>
          </div>
        ))}
        {pendingInvites.map((inv) => (
          <div className="team-member-row team-member-pending" key={inv.email}>
            <div>
              <div className="team-member-name">{inv.email}</div>
              <div className="team-member-email">Invite pending</div>
            </div>
            <span className={`team-role-pill team-role-${inv.role}`}>{inv.role}</span>
          </div>
        ))}
      </div>

      {isOwner ? (
        <>
          <p className="profile-section-title" style={{ marginTop: 24 }}>Invite a teammate</p>
          <form onSubmit={handleInvite}>
            <div className="profile-form-row">
              <div className="profile-field">
                <label>Email</label>
                <input
                  type="email"
                  placeholder="teammate@company.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                />
              </div>
              <div className="profile-field">
                <label>Role</label>
                <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value)}>
                  <option value="contributor">Contributor</option>
                  <option value="viewer">Viewer</option>
                </select>
              </div>
            </div>
            <div className="profile-save-row">
              <button type="submit" className="profile-save-btn" disabled={inviting}>
                {inviting ? 'Sending…' : 'Send invite'}
              </button>
              {msg && <span className={`profile-msg ${msg.type}`}>{msg.text}</span>}
            </div>
          </form>
        </>
      ) : (
        <div className="profile-readonly-note" style={{ marginTop: 20 }}>
          Only the project owner can invite teammates.
        </div>
      )}
    </div>
  );
}
