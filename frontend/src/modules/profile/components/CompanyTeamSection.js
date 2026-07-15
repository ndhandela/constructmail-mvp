import React, { useState, useEffect, useCallback } from 'react';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

function teamMemberDisplayName(m) {
  return m.full_name || m.name || m.email;
}

export default function CompanyTeamSection({ userId, isOwner }) {
  const [team, setTeam] = useState([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteFullName, setInviteFullName] = useState('');
  const [inviting, setInviting] = useState(false);
  const [msg, setMsg] = useState(null);

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

  if (loading) {
    return <p className="profile-section-title" style={{ marginTop: 24 }}>Loading team…</p>;
  }

  return (
    <>
      <p className="profile-section-title" style={{ marginTop: 24 }}>Team</p>
      <div className="team-member-list">
        {team.map((m) => (
          <div className="team-member-row" key={m.id}>
            <div>
              <div className="team-member-name">{teamMemberDisplayName(m)}</div>
              <div className="team-member-email">
                {m.email}{m.invite_pending ? ' · Invite pending' : ''}
              </div>
            </div>
            <span className={`team-role-pill team-role-${m.permission_level}`}>
              {m.permission_level}
            </span>
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
