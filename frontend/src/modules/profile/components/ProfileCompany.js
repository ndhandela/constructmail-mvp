import React, { useState, useEffect, useCallback } from 'react';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

const SIZE_OPTIONS = ['1-10', '11-50', '51-200', '200+'];
const ADMIN_ROLES = new Set(['admin', 'owner', 'Admin', 'Owner']);

function teamMemberDisplayName(m) {
  return m.full_name || m.name || m.email;
}

function TeamSection({ userId, isOwner }) {
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

export default function ProfileCompany({ company, userRole, permissionLevel, userId, onCompanyUpdated }) {
  const canEdit = ADMIN_ROLES.has(userRole);
  const [form, setForm] = useState({
    company_name:    company?.company_name    || '',
    company_phone:   company?.company_phone   || '',
    company_address: company?.company_address || '',
    company_city:    company?.company_city    || '',
    company_state:   company?.company_state   || '',
    company_zip:     company?.company_zip     || '',
    company_website: company?.company_website || '',
    company_size:    company?.company_size    || '',
  });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  const handleChange = (e) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
    setMsg(null);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/profile/company?userId=${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (data.success) {
        setMsg({ type: 'success', text: 'Company info saved.' });
        if (onCompanyUpdated) onCompanyUpdated(data.company);
      } else {
        setMsg({ type: 'error', text: data.detail || 'Could not save company info.' });
      }
    } catch {
      setMsg({ type: 'error', text: 'Network error. Try again.' });
    } finally {
      setSaving(false);
    }
  };

  const fieldProps = (name) => ({
    name,
    value: form[name],
    onChange: handleChange,
    readOnly: !canEdit,
    disabled: !canEdit,
  });

  return (
    <div className="profile-card">
      {!canEdit && (
        <div className="profile-readonly-note">
          Contact your account admin to update company information.
        </div>
      )}

      <form onSubmit={handleSave}>
        <div className="profile-form-row single">
          <div className="profile-field">
            <label>Company Name</label>
            <input placeholder="Company name" {...fieldProps('company_name')} />
          </div>
        </div>

        <div className="profile-form-row">
          <div className="profile-field">
            <label>Company Phone</label>
            <input placeholder="Company phone" {...fieldProps('company_phone')} />
          </div>
          <div className="profile-field">
            <label>Website</label>
            <input placeholder="https://example.com" {...fieldProps('company_website')} />
          </div>
        </div>

        <div className="profile-form-row single">
          <div className="profile-field">
            <label>Address</label>
            <input placeholder="Street address" {...fieldProps('company_address')} />
          </div>
        </div>

        <div className="profile-form-row">
          <div className="profile-field">
            <label>City</label>
            <input placeholder="City" {...fieldProps('company_city')} />
          </div>
          <div className="profile-field">
            <label>State</label>
            <input placeholder="State" {...fieldProps('company_state')} />
          </div>
        </div>

        <div className="profile-form-row">
          <div className="profile-field">
            <label>ZIP</label>
            <input placeholder="ZIP code" {...fieldProps('company_zip')} />
          </div>
          <div className="profile-field">
            <label>Company Size</label>
            <select
              name="company_size"
              value={form.company_size}
              onChange={handleChange}
              disabled={!canEdit}
            >
              <option value="">Select size…</option>
              {SIZE_OPTIONS.map(s => (
                <option key={s} value={s}>{s} employees</option>
              ))}
            </select>
          </div>
        </div>

        {canEdit && (
          <div className="profile-save-row">
            <button type="submit" className="profile-save-btn" disabled={saving}>
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
            {msg && <span className={`profile-msg ${msg.type}`}>{msg.text}</span>}
          </div>
        )}
      </form>

      <TeamSection userId={userId} isOwner={permissionLevel === 'owner'} />
    </div>
  );
}
