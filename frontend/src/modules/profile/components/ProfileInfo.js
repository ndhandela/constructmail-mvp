import React, { useState } from 'react';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

export default function ProfileInfo({ profile, userId, onProfileUpdated }) {
  const [form, setForm] = useState({
    first_name: profile?.first_name || '',
    last_name:  profile?.last_name  || '',
    phone:      profile?.phone      || '',
    job_title:  profile?.job_title  || '',
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
      const res = await fetch(`${API_BASE_URL}/api/profile?userId=${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (data.success) {
        setMsg({ type: 'success', text: 'Profile saved successfully.' });
        if (onProfileUpdated) onProfileUpdated(data.profile);
      } else {
        setMsg({ type: 'error', text: data.detail || 'Could not save profile.' });
      }
    } catch {
      setMsg({ type: 'error', text: 'Network error. Try again.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="profile-card">
      <form onSubmit={handleSave}>
        <div className="profile-form-row">
          <div className="profile-field">
            <label>First Name</label>
            <input
              name="first_name"
              value={form.first_name}
              onChange={handleChange}
              placeholder="First name"
            />
          </div>
          <div className="profile-field">
            <label>Last Name</label>
            <input
              name="last_name"
              value={form.last_name}
              onChange={handleChange}
              placeholder="Last name"
            />
          </div>
        </div>

        <div className="profile-form-row single">
          <div className="profile-field">
            <label>Email</label>
            <input
              value={profile?.email || ''}
              readOnly
              tabIndex={-1}
            />
          </div>
        </div>

        <div className="profile-form-row">
          <div className="profile-field">
            <label>Phone</label>
            <input
              name="phone"
              value={form.phone}
              onChange={handleChange}
              placeholder="Phone number"
            />
          </div>
          <div className="profile-field">
            <label>Job Title</label>
            <input
              name="job_title"
              value={form.job_title}
              onChange={handleChange}
              placeholder="e.g. Project Manager"
            />
          </div>
        </div>

        <div className="profile-save-row">
          <button type="submit" className="profile-save-btn" disabled={saving}>
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
          {msg && <span className={`profile-msg ${msg.type}`}>{msg.text}</span>}
        </div>
      </form>
    </div>
  );
}
