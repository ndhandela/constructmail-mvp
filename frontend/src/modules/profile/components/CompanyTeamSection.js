import React, { useState, useEffect, useCallback } from 'react';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

function teamMemberDisplayName(m) {
  return m.full_name || m.name || m.email;
}

export default function CompanyTeamSection({ userId, isOwner, companyId, trustEnabled, invoiceTrackerEnabled }) {
  const [team, setTeam] = useState([]);
  const [loading, setLoading] = useState(true);
  const [trustRoleState, setTrustRoleState] = useState({});
  const [restrictedModuleState, setRestrictedModuleState] = useState({});
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteFullName, setInviteFullName] = useState('');
  const [inviteRestricted, setInviteRestricted] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [msg, setMsg] = useState(null);

  const [accountantEmail, setAccountantEmail] = useState('');
  const [accountantName, setAccountantName] = useState('');
  const [invitingAccountant, setInvitingAccountant] = useState(false);
  const [accountantMsg, setAccountantMsg] = useState(null);
  const [accountants, setAccountants] = useState([]);

  const [companyProjects, setCompanyProjects] = useState([]);
  const [selectedInviteProjectIds, setSelectedInviteProjectIds] = useState(new Set());
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [selectedAccountantInviteProjectIds, setSelectedAccountantInviteProjectIds] = useState(new Set());

  const [editingAccountantId, setEditingAccountantId] = useState(null);
  const [accountantProjectsList, setAccountantProjectsList] = useState([]);
  const [accountantProjectsLoading, setAccountantProjectsLoading] = useState(false);
  const [selectedAccountantProjectIds, setSelectedAccountantProjectIds] = useState(new Set());
  const [savingAccountantProjects, setSavingAccountantProjects] = useState(false);
  const [accountantProjectsMsg, setAccountantProjectsMsg] = useState(null);

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

  const fetchAccountants = useCallback(async () => {
    if (!companyId || !isOwner) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/invoice-accountants/companies/${companyId}?userId=${userId}`);
      const data = await res.json();
      if (data.success) setAccountants(data.accountants || []);
    } catch (err) {
      console.error('Fetch accountants error:', err);
    }
  }, [companyId, isOwner, userId]);

  useEffect(() => { if (invoiceTrackerEnabled) fetchAccountants(); }, [invoiceTrackerEnabled, fetchAccountants]);

  useEffect(() => {
    if (!companyId) {
      setCompanyProjects([]);
      setProjectsLoading(false);
      return;
    }
    setProjectsLoading(true);
    fetch(`${API_BASE_URL}/api/projects/company/${companyId}`)
      .then((res) => res.json())
      .then((data) => {
        const projects = data.projects || [];
        setCompanyProjects(projects);
        setSelectedInviteProjectIds(new Set(projects.map((p) => p.id)));
        setSelectedAccountantInviteProjectIds(new Set(projects.map((p) => p.id)));
      })
      .catch((err) => console.error('Fetch company projects error:', err))
      .finally(() => setProjectsLoading(false));
  }, [companyId]);

  const toggleInviteProjectId = (id) => {
    setSelectedInviteProjectIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAccountantInviteProjectId = (id) => {
    setSelectedAccountantInviteProjectIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAccountantProjectId = (id) => {
    setSelectedAccountantProjectIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleInvite = async (e) => {
    e.preventDefault();
    if (!inviteEmail.trim() || !inviteFullName.trim()) return;
    if (projectsLoading) return;
    // Guards against sending an invite with projectIds: [] when the
    // company does have projects to grant — belt-and-suspenders alongside
    // disabling the submit button while projectsLoading is true, in case
    // that disable is bypassed (e.g. Enter-key submit racing the fetch).
    // An empty selection is only valid when the company truly has no
    // projects yet (companyProjects.length === 0).
    if (companyProjects.length > 0 && selectedInviteProjectIds.size === 0) {
      setMsg({ type: 'error', text: 'Select at least one project to give this teammate access to.' });
      return;
    }
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
          restrictedModule: inviteRestricted ? 'invoice_tracker' : null,
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
      setInviteRestricted(false);
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

  const handleRestrictedModuleChange = async (memberId, restrictedModule) => {
    setRestrictedModuleState((prev) => ({ ...prev, [memberId]: { saving: true } }));
    try {
      const res = await fetch(`${API_BASE_URL}/api/team/${memberId}/restricted-module`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requesterId: Number(userId), restricted_module: restrictedModule || null }),
      });
      const data = await res.json();
      if (!res.ok) {
        setRestrictedModuleState((prev) => ({ ...prev, [memberId]: { saving: false, error: data.detail || 'Could not update access.' } }));
        return;
      }
      setTeam((prev) => prev.map((m) => (m.id === memberId ? { ...m, restricted_module: data.restricted_module } : m)));
      setRestrictedModuleState((prev) => ({ ...prev, [memberId]: { saving: false } }));
    } catch (err) {
      console.error('Update restricted module error:', err);
      setRestrictedModuleState((prev) => ({ ...prev, [memberId]: { saving: false, error: 'Network error.' } }));
    }
  };

  const handleInviteAccountant = async (e) => {
    e.preventDefault();
    if (!accountantEmail.trim()) return;
    if (projectsLoading) return;
    // Same belt-and-suspenders guard as handleInvite above — an accountant
    // invite with no project access is a valid but almost-certainly-not-
    // what-the-owner-meant state, so require an explicit choice whenever
    // the company actually has projects to grant.
    if (companyProjects.length > 0 && selectedAccountantInviteProjectIds.size === 0) {
      setAccountantMsg({ type: 'error', text: 'Select at least one project to give this accountant access to.' });
      return;
    }
    setInvitingAccountant(true);
    setAccountantMsg(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/invoice-accountants/companies/${companyId}/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: Number(userId),
          email: accountantEmail.trim(),
          name: accountantName.trim() || null,
          projectIds: Array.from(selectedAccountantInviteProjectIds),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAccountantMsg({ type: 'error', text: data.detail || 'Could not send invite.' });
        return;
      }
      setAccountantMsg({ type: 'success', text: `Invite sent to ${accountantEmail}.` });
      setAccountantEmail('');
      setAccountantName('');
      fetchAccountants();
    } catch (err) {
      console.error('Invite accountant error:', err);
      setAccountantMsg({ type: 'error', text: 'Network error. Try again.' });
    } finally {
      setInvitingAccountant(false);
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

  const toggleEditAccountant = async (accessId) => {
    if (editingAccountantId === accessId) {
      setEditingAccountantId(null);
      return;
    }
    setEditingAccountantId(accessId);
    setAccountantProjectsMsg(null);
    setAccountantProjectsLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/invoice-accountants/${accessId}/projects?requesterId=${userId}`);
      const data = await res.json();
      if (data.success) {
        setAccountantProjectsList(data.projects || []);
        setSelectedAccountantProjectIds(new Set((data.projects || []).filter((p) => p.has_access).map((p) => p.id)));
      }
    } catch (err) {
      console.error('Fetch accountant projects error:', err);
    } finally {
      setAccountantProjectsLoading(false);
    }
  };

  const handleSaveAccountantProjects = async (accessId) => {
    setSavingAccountantProjects(true);
    setAccountantProjectsMsg(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/invoice-accountants/${accessId}/projects`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requesterId: Number(userId),
          projectIds: Array.from(selectedAccountantProjectIds),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAccountantProjectsMsg({ type: 'error', text: data.detail || 'Could not update access.' });
        return;
      }
      setEditingAccountantId(null);
      fetchAccountants();
    } catch (err) {
      console.error('Update accountant projects error:', err);
      setAccountantProjectsMsg({ type: 'error', text: 'Network error. Try again.' });
    } finally {
      setSavingAccountantProjects(false);
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

            {invoiceTrackerEnabled && m.permission_level !== 'owner' && (
              <div className="team-access-panel" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="profile-readonly-note">Module access:</span>
                {isOwner ? (
                  <select
                    value={m.restricted_module || ''}
                    onChange={(e) => handleRestrictedModuleChange(m.id, e.target.value)}
                    disabled={restrictedModuleState[m.id]?.saving}
                  >
                    <option value="">Full access (all enabled modules)</option>
                    <option value="invoice_tracker">Invoices only</option>
                  </select>
                ) : (
                  <span className="team-role-pill">
                    {m.restricted_module === 'invoice_tracker' ? 'Invoices only' : 'Full access'}
                  </span>
                )}
                {restrictedModuleState[m.id]?.error && (
                  <span className="profile-msg error">{restrictedModuleState[m.id].error}</span>
                )}
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

            {invoiceTrackerEnabled && (
              <div className="profile-field" style={{ marginBottom: 16 }}>
                <label className="team-access-checkbox-item" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    type="checkbox"
                    checked={inviteRestricted}
                    onChange={(e) => setInviteRestricted(e.target.checked)}
                  />
                  Restrict this teammate to Invoices only (no other module access)
                </label>
              </div>
            )}

            <div className="profile-save-row">
              <button type="submit" className="profile-save-btn" disabled={inviting || projectsLoading}>
                {inviting ? 'Sending…' : projectsLoading ? 'Loading projects…' : 'Send invite'}
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

      {invoiceTrackerEnabled && isOwner && (
        <>
          <p className="profile-section-title" style={{ marginTop: 32 }}>Invoices accountants</p>
          <p className="profile-readonly-note" style={{ marginBottom: 12 }}>
            A separate, read-only invite — an accountant can view and download invoices for this
            company only. No sidebar, no other modules, and no upload/edit/delete access.
          </p>

          {accountants.length > 0 && (
            <div className="team-member-list" style={{ marginBottom: 20 }}>
              {accountants.map((a) => (
                <div className="team-member-row-wrap" key={a.access_id}>
                  <div className="team-member-row">
                    <div>
                      <div className="team-member-name">{a.accountant_name || a.accountant_email}</div>
                      <div className="team-member-email">{a.accountant_email}</div>
                      <div className="profile-readonly-note" style={{ marginTop: 4 }}>
                        {a.project_names && a.project_names.length > 0
                          ? `Access: ${a.project_names.join(', ')}`
                          : 'No project access yet'}
                      </div>
                    </div>
                    <div className="team-member-row-actions">
                      <span className={`team-role-pill team-role-${a.status}`}>{a.status}</span>
                      <button
                        type="button"
                        className="team-edit-btn"
                        onClick={() => toggleEditAccountant(a.access_id)}
                        aria-label="Edit project access"
                        aria-expanded={editingAccountantId === a.access_id}
                      >
                        ✎
                      </button>
                    </div>
                  </div>

                  {editingAccountantId === a.access_id && (
                    <div className="team-access-panel">
                      {accountantProjectsLoading ? (
                        <p className="profile-readonly-note">Loading project access…</p>
                      ) : accountantProjectsList.length === 0 ? (
                        <p className="profile-readonly-note">No projects yet.</p>
                      ) : (
                        <div className="team-access-checkbox-list">
                          {accountantProjectsList.map((p) => (
                            <label className="team-access-checkbox-item" key={p.id}>
                              <input
                                type="checkbox"
                                checked={selectedAccountantProjectIds.has(p.id)}
                                onChange={() => toggleAccountantProjectId(p.id)}
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
                          disabled={savingAccountantProjects || accountantProjectsLoading}
                          onClick={() => handleSaveAccountantProjects(a.access_id)}
                        >
                          {savingAccountantProjects ? 'Saving…' : 'Save'}
                        </button>
                        <button
                          type="button"
                          className="team-cancel-btn"
                          onClick={() => setEditingAccountantId(null)}
                        >
                          Cancel
                        </button>
                        {accountantProjectsMsg && (
                          <span className={`profile-msg ${accountantProjectsMsg.type}`}>{accountantProjectsMsg.text}</span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          <form onSubmit={handleInviteAccountant}>
            <div className="profile-form-row">
              <div className="profile-field">
                <label>Name (optional)</label>
                <input
                  type="text"
                  placeholder="Ada Ledger"
                  value={accountantName}
                  onChange={(e) => setAccountantName(e.target.value)}
                />
              </div>
              <div className="profile-field">
                <label>Email</label>
                <input
                  type="email"
                  placeholder="accountant@firm.com"
                  value={accountantEmail}
                  onChange={(e) => setAccountantEmail(e.target.value)}
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
                        checked={selectedAccountantInviteProjectIds.has(p.id)}
                        onChange={() => toggleAccountantInviteProjectId(p.id)}
                      />
                      {p.name}
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div className="profile-save-row">
              <button type="submit" className="profile-save-btn" disabled={invitingAccountant || projectsLoading}>
                {invitingAccountant ? 'Sending…' : projectsLoading ? 'Loading projects…' : 'Invite accountant'}
              </button>
              {accountantMsg && <span className={`profile-msg ${accountantMsg.type}`}>{accountantMsg.text}</span>}
            </div>
          </form>
        </>
      )}
    </>
  );
}
