import React, { useState, useEffect } from 'react';
import ProfileInfo from '../components/ProfileInfo';
import ProfileCompany from '../components/ProfileCompany';
import ProfileSecurity from '../components/ProfileSecurity';
import ProjectTeam from '../components/ProjectTeam';
import '../styles/Profile.css';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

const TABS = [
  { key: 'info',     label: 'My Information' },
  { key: 'company',  label: 'Company' },
  { key: 'team',     label: 'Project Team' },
  { key: 'security', label: 'Security' },
];

function getInitials(profile) {
  if (profile?.first_name || profile?.last_name) {
    return `${(profile.first_name || '')[0] || ''}${(profile.last_name || '')[0] || ''}`.toUpperCase();
  }
  if (profile?.full_name || profile?.name) {
    const parts = (profile.full_name || profile.name || '').trim().split(' ');
    return parts.map(p => p[0]).slice(0, 2).join('').toUpperCase();
  }
  return (profile?.email || '?')[0].toUpperCase();
}

function getDisplayName(profile) {
  if (profile?.first_name || profile?.last_name) {
    return `${profile.first_name || ''} ${profile.last_name || ''}`.trim();
  }
  return profile?.full_name || profile?.name || profile?.email || '';
}

export default function ProfileApp({ userId }) {
  const [activeTab, setActiveTab] = useState('info');
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
      console.error('Profile fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div style={{ padding: 60, textAlign: 'center', color: 'var(--slate)' }}>Loading profile…</div>;
  }

  const initials = getInitials(profile);
  const displayName = getDisplayName(profile);

  return (
    <div className="profile-page">
      <div className="profile-inner">
        {/* Avatar + name header */}
        <div className="profile-header">
          <div className="profile-avatar">
            {profile?.avatar_url
              ? <img src={profile.avatar_url} alt={displayName} />
              : initials
            }
          </div>
          <div className="profile-header-info">
            <h2>{displayName || 'Your Profile'}</h2>
            <p>{profile?.job_title || profile?.role || profile?.email || ''}</p>
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

        {/* Tab content */}
        {activeTab === 'info' && (
          <ProfileInfo
            profile={profile}
            userId={userId}
            onProfileUpdated={(updated) => setProfile(prev => ({ ...prev, ...updated }))}
          />
        )}
        {activeTab === 'company' && (
          <ProfileCompany
            company={company}
            userRole={profile?.role}
            userId={userId}
            onCompanyUpdated={(updated) => setCompany(prev => ({ ...prev, ...updated }))}
          />
        )}
        {activeTab === 'team' && (
          <ProjectTeam userId={userId} />
        )}
        {activeTab === 'security' && (
          <ProfileSecurity userId={userId} />
        )}
      </div>
    </div>
  );
}
