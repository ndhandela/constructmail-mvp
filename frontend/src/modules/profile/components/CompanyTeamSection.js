import React, { useState, useEffect, useCallback } from 'react';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

function teamMemberDisplayName(m) {
  return m.full_name || m.name || m.email;
}

export default function CompanyTeamSection({ userId, isOwner, companyId, trustEnabled }) {
  const [team, setTeam] = useState([]);
  const [loading, setLoading] = useState(true);
  const [trustRoleState, setTrustRoleState] = useState({});
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteFullName, setInviteFullName] = useState('');
  const [inviting, setInviting] = useState(false);
  const [msg, setMsg] = useState(null);

  const [companyProjects, setCompanyProjects] = useState([]);
  const [selectedInviteProjectIds, setSelectedInviteProjectIds] = useState(new Set());

  const [editingMemberId, setEditingMemberId] = useState(null);
  const [memberProjects, setMemberProjects] = useState([]);
  const [memberProjectsLoading, setMemberProjectsLoading] = useState(false);
  const [selectedMemberProjectIds, setSelectedMemberProjectIds] = useState(new Set());
  const [savingMemberProjects, setSavingMemberProjects] = useState(false);
  const [memberProjectsMsg, setMemberProjectsMsg] = useState(null);

  const fetchTeam = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/team?userId=${userId}`);
      const data = await res.json();
      if (data.success) setTeam(data.team || []);
    } catch (err) {
      console.error('Fetch team error:', err);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { fetchTeam(); }, [fetchTeam]);

  useEffect(() => {
    if (!companyId) {
      setCompanyProjects([]);
      return;
    }
    fetch(`${API_BASE_URL}/api/projects/company/${companyId}`)
      .then((res) => res.json())
      .then((data) => {
        const projects = data.projects || [];
        setCompanyProjects(projects);
        setSelectedInviteProjectIds(new Set(projects.map((p) => p.id)));
      })
      .catch((err) => console.error('Fetch company projects error:', err));
  }, [companyId]);

  const toggleInviteProjectId = (id) => {
    setSelectedInviteProjectIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleInvite = async (e) => {
    e.preventDefault();
    if (!inviteEmail.trim() || !inviteFullName.trim()) return;
    setInviting(true);
    setMsg(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/team/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: Number(userId),
          email: inviteEmail.trim(),
          fullName: inviteFullName.trim(),
          projectIds: Array.from(selectedInviteProjectIds),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg({ type: 'error', text: data.detail || 'Could not send invite.' });
        return;
      }
      setMsg({ type: 'success', text: `Invite sent to ${inviteEmail}.` });
      setInviteEmail('');
      setInviteFullName('');
      fetchTeam();
    } catch (err) {
      console.error('Invite teammate error:', err);
      setMsg({ type: 'error', text: 'Network error. Try again.' });
    } finally {
      setInviting(false);
    }
  };

  const toggleEditMember = async (memberId) => {
    if (editingMemberId === memberId) {
      setEditingMemberId(null);
      return;
    }
    setEditingMemberId(memberId);
    setMemberProjectsMsg(null);
    setMemberProjectsLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/team/${memberId}/projects?requesterId=${userId}`);
      const data = await res.json();
      if (data.success) {
        setMemberProjects(data.projects || []);
        setSelectedMemberProjectIds(new Set((data.projects || []).filter((p) => p.has_access).map((p) => p.id)));
      }
    } catch (err) {
      console.error('Fetch member projects error:', err);
    } finally {
      setMemberProjectsLoading(false);
    }
  };

  const toggleMemberProjectId = (id) => {
    setSelectedMemberProjectIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleTrustRoleChange = async (memberId, trustRole) => {
    setTrustRoleState((prev) => ({ ...prev, [memberId]: { saving: true } }));
    try {
      const res = await fetch(`${API_BASE_URL}/api/team/${memberId}/trust-role`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requesterId: Number(userId), trust_role: trustRole || null }),
      });
      const data = await res.json();
      if (!res.ok) {
        setTrustRoleState((prev) => ({ ...prev, [memberId]: { saving: false, error: data.detail || 'Could not update role.' } }));
        return;
      }
      setTeam((prev) => prev.map((m) => (m.id === memberId ? { ...m, trust_role: data.trust_role } : m)));
      setTrustRoleState((prev) => ({ ...prev, [memberId]: { saving: false } }));
    } catch (err) {
      console.error('Update trust role error:', err);
      setTrustRoleState((prev) => ({ ...prev, [memberId]: { saving: false, error: 'Network error.' } }));
    }
  };

  const handleSaveMemberProjects = async (memberId) => {
    setSavingMemberProjects(true);
    setMemberProjectsMsg(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/team/${memberId}/projects`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requesterId: Number(userId),
          projectIds: Array.from(selectedMemberProjectIds),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMemberProjectsMsg({ type: 'error', text: data.detail || 'Could not update access.' });
        return;
      }
      setEditingMemberId(null);
      fetchTeam();
    } catch (err) {
      console.error('Update member projects error:', err);
      setMemberProjectsMsg({ type: 'error', text: 'Network error. Try again.' });
    } finally {
      setSavingMemberProjects(false);
    }
  };

  if (loading) {
    return <p className="profile-section-title" style={{ marginTop: 24 }}>Loading team…</p>;
  }

  return (
    <>
      <p className="profile-section-title" style={{ marginTop: 24 }}>Team</p>
      <div className="team-member-list">
        {team.map((m) => (
          <div className="team-member-row-wrap" key={m.id}>
            <div className="team-member-row">
              <div>
                <div className="team-member-name">{teamMemberDisplayName(m)}</div>
                <div className="team-member-email">
                  {m.email}{m.invite_pending ? ' · Invite pending' : ''}
                </div>
              </div>
              <div className="team-member-row-actions">
                <span className={`team-role-pill team-role-${m.permission_level}`}>
                  {m.permission_level}
                </span>
                {isOwner && (
                  <button
                    type="button"
                    className="team-edit-btn"
                    onClick={() => toggleEditMember(m.id)}
                    aria-label="Edit project access"
                    aria-expanded={editingMemberId === m.id}
                  >
                    ✎
                  </button>
                )}
              </div>
            </div>

            {trustEnabled && m.permission_level !== 'owner' && (
              <div className="team-access-panel" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="profile-readonly-note">POMAR Trust role:</span>
                {isOwner ? (
                  <select
                    value={m.trust_role || ''}
                    onChange={(e) => handleTrustRoleChange(m.id, e.target.value)}
                    disabled={trustRoleState[m.id]?.saving}
                  >
                    <option value="">No Trust access</option>
                    <option value="site_data">Site Data</option>
                    <option value="compliance_reviewer">Compliance Reviewer</option>
                  </select>
                ) : (
                  <span className="team-role-pill">{m.trust_role || 'No Trust access'}</span>
                )}
                {trustRoleState[m.id]?.error && (
                  <span className="profile-msg error">{trustRoleState[m.id].error}</span>
                )}
              </div>
            )}
            {trustEnabled && m.permission_level === 'owner' && (
              <div className="team-access-panel">
                <span className="profile-readonly-note">POMAR Trust role: Owner (full access)</span>
              </div>
            )}

            {isOwner && editingMemberId === m.id && (
              <div className="team-access-panel">
                {memberProjectsLoading ? (
                  <p className="profile-readonly-note">Loading project access…</p>
                ) : memberProjects.length === 0 ? (
                  <p className="profile-readonly-note">No projects yet.</p>
                ) : (
                  <div className="team-access-checkbox-list">
                    {memberProjects.map((p) => (
                      <label className="team-access-checkbox-item" key={p.id}>
                        <input
                          type="checkbox"
                          checked={selectedMemberProjectIds.has(p.id)}
                          onChange={() => toggleMemberProjectId(p.id)}
                        />
                        {p.name}
                      </label>
                    ))}
                  </div>
                )}
                <div className="profile-save-row">
                  <button
                    type="button"
                    className="profile-save-btn"
                    disabled={savingMemberProjects || memberProjectsLoading}
                    onClick={() => handleSaveMemberProjects(m.id)}
                  >
                    {savingMemberProjects ? 'Saving…' : 'Save'}
                  </button>
                  <button
                    type="button"
                    className="team-cancel-btn"
                    onClick={() => setEditingMemberId(null)}
                  >
                    Cancel
                  </button>
                  {memberProjectsMsg && (
                    <span className={`profile-msg ${memberProjectsMsg.type}`}>{memberProjectsMsg.text}</span>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {isOwner ? (
        <>
          <p className="profile-section-title" style={{ marginTop: 24 }}>Invite a teammate</p>
          <form onSubmit={handleInvite}>
            <div className="profile-form-row">
              <div className="profile-field">
                <label>Full Name</label>
                <input
                  type="text"
                  placeholder="Jane Doe"
                  value={inviteFullName}
                  onChange={(e) => setInviteFullName(e.target.value)}
                />
              </div>
              <div className="profile-field">
                <label>Email</label>
                <input
                  type="email"
                  placeholder="teammate@company.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                />
              </div>
            </div>

            {companyProjects.length > 0 && (
              <div className="profile-field" style={{ marginBottom: 16 }}>
                <label>Give access to:</label>
                <div className="team-access-checkbox-list">
                  {companyProjects.map((p) => (
                    <label className="team-access-checkbox-item" key={p.id}>
                      <input
                        type="checkbox"
                        checked={selectedInviteProjectIds.has(p.id)}
                        onChange={() => toggleInviteProjectId(p.id)}
                      />
                      {p.name}
                    </label>
                  ))}
                </div>
              </div>
            )}

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
          Only the company owner can invite teammates.
        </div>
      )}
    </>
  );
}
