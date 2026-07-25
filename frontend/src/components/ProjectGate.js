import React, { useContext } from 'react';
import { ProjectContext } from '../contexts/ProjectContext';
import NewProjectModal from './NewProjectModal';
import '../styles/ProjectGate.css';

// Gates product routes behind "the company has at least one project" —
// replaces the old silent "Default Project" auto-creation. Owners get a
// mandatory create-project form; members just wait for their owner.
export default function ProjectGate({ userId, user, children }) {
  const { projects, loading, refreshProjects } = useContext(ProjectContext);

  // A vendor with a pending (not yet accepted) invite has zero projects by
  // definition — accepting is what grants the first one (see
  // routers/project_vendor_access.py). Without this bypass, they'd never
  // reach the invite-accept banner (rendered by the module page itself,
  // e.g. DailyLogsApp.js) to get past this screen in the first place.
  const hasPendingVendorInvite = (user?.pending_vendor_invites?.length ?? 0) > 0;

  if (loading || projects.length > 0 || hasPendingVendorInvite) {
    return children;
  }

  if (user?.permission_level === 'owner') {
    return (
      <NewProjectModal
        userId={userId}
        dismissible={false}
        onClose={() => {}}
        onCreated={() => refreshProjects()}
      />
    );
  }

  return (
    <div className="project-gate-waiting">
      <p>Your company owner hasn't created a project yet. Ask them to set one up before you can get started.</p>
    </div>
  );
}
