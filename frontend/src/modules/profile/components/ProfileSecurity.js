import React, { useState } from 'react';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

function getStrength(pw) {
  if (!pw) return null;
  let score = 0;
  if (pw.length >= 8)  score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/\d/.test(pw))   score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  if (score <= 2) return 'weak';
  if (score <= 3) return 'fair';
  return 'strong';
}

function PasswordField({ label, name, value, onChange }) {
  const [show, setShow] = useState(false);
  return (
    <div className="profile-password-field">
      <label>{label}</label>
      <div className="profile-password-input-wrap">
        <input
          type={show ? 'text' : 'password'}
          name={name}
          value={value}
          onChange={onChange}
          autoComplete="new-password"
        />
        <button
          type="button"
          className="profile-eye-btn"
          onClick={() => setShow(v => !v)}
          tabIndex={-1}
          aria-label={show ? 'Hide password' : 'Show password'}
        >
          {show ? '🙈' : '👁️'}
        </button>
      </div>
    </div>
  );
}

export default function ProfileSecurity({ userId }) {
  const [form, setForm] = useState({
    current_password:     '',
    new_password:         '',
    confirm_new_password: '',
  });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  const strength = getStrength(form.new_password);

  const handleChange = (e) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
    setMsg(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (form.new_password !== form.confirm_new_password) {
      setMsg({ type: 'error', text: 'New passwords do not match.' });
      return;
    }
    if (form.new_password.length < 8) {
      setMsg({ type: 'error', text: 'New password must be at least 8 characters.' });
      return;
    }
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/profile/change-password?userId=${userId}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        }
      );
      const data = await res.json();
      if (data.success) {
        setMsg({ type: 'success', text: 'Password updated successfully.' });
        setForm({ current_password: '', new_password: '', confirm_new_password: '' });
      } else {
        setMsg({ type: 'error', text: data.detail || 'Could not update password.' });
      }
    } catch {
      setMsg({ type: 'error', text: 'Network error. Try again.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="profile-card">
      <p className="profile-section-title">Change Password</p>
      <form onSubmit={handleSubmit}>
        <PasswordField
          label="Current Password"
          name="current_password"
          value={form.current_password}
          onChange={handleChange}
        />

        <PasswordField
          label="New Password"
          name="new_password"
          value={form.new_password}
          onChange={handleChange}
        />

        {form.new_password && strength && (
          <div className="password-strength">
            <div className="password-strength-bar">
              <div className={`password-strength-fill strength-${strength}`} />
            </div>
            <span className={`password-strength-label label-${strength}`}>
              {strength.charAt(0).toUpperCase() + strength.slice(1)}
            </span>
          </div>
        )}

        <PasswordField
          label="Confirm New Password"
          name="confirm_new_password"
          value={form.confirm_new_password}
          onChange={handleChange}
        />

        <div className="profile-save-row">
          <button type="submit" className="profile-save-btn" disabled={saving}>
            {saving ? 'Updating…' : 'Update Password'}
          </button>
          {msg && <span className={`profile-msg ${msg.type}`}>{msg.text}</span>}
        </div>
      </form>
    </div>
  );
}
