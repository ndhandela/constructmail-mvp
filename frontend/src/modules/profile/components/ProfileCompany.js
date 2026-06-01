import React, { useState } from 'react';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

const SIZE_OPTIONS = ['1-10', '11-50', '51-200', '200+'];
const ADMIN_ROLES = new Set(['admin', 'owner', 'Admin', 'Owner']);

export default function ProfileCompany({ company, userRole, userId, onCompanyUpdated }) {
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
    </div>
  );
}
