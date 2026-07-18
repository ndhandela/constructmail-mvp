import React, { useState, useEffect } from 'react';
import ProfileCompany from '../components/ProfileCompany';
import CompanyTeamSection from '../components/CompanyTeamSection';
import '../styles/Profile.css';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

const TABS = [
  { key: 'company', label: 'Company' },
  { key: 'team',    label: 'Team' },
];

function getCompanyInitials(company) {
  const name = (company?.company_name || '').trim();
  if (!name) return '?';
  return name.split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
}

export default function CompanySettingsApp({ userId }) {
  const [activeTab, setActiveTab] = useState('company');
  const [profile, setProfile] = useState(null);
  const [company, setCompany] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchProfile = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/profile?userId=${userId}`);
      const data = await res.json();
      if (data.success) {
        setProfile(data.profile);
        setCompany(data.company);
      }
    } catch (err) {
      console.error('Company settings fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div style={{ padding: 60, textAlign: 'center', color: 'var(--slate)' }}>Loading company settings…</div>;
  }

  return (
    <div className="profile-page">
      <div className="profile-inner">
        {/* Company header — mirrors ProfileApp's avatar+name header, but for
            the company instead of the individual user */}
        <div className="profile-header">
          <div className="profile-avatar">{getCompanyInitials(company)}</div>
          <div className="profile-header-info">
            <h2>{company?.company_name || 'Company Settings'}</h2>
            <p>Company profile and team management</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="profile-tabs">
          {TABS.map(t => (
            <button
              key={t.key}
              className={`profile-tab ${activeTab === t.key ? 'active' : ''}`}
              onClick={() => setActiveTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab content — same components/props as before the relocation */}
        {activeTab === 'company' && (
          <ProfileCompany
            company={company}
            permissionLevel={profile?.permission_level}
            userId={userId}
            onCompanyUpdated={(updated) => setCompany(prev => ({ ...prev, ...updated }))}
          />
        )}
        {activeTab === 'team' && (
          <div className="profile-card">
            <CompanyTeamSection
              userId={userId}
              isOwner={profile?.permission_level === 'owner'}
              companyId={profile?.company_id}
              trustEnabled={!!profile?.active_modules?.trust}
            />
          </div>
        )}
      </div>
    </div>
  );
}
