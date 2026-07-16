import React, { useContext } from 'react';
import { ProjectContext } from '../contexts/ProjectContext';
import NewProjectModal from './NewProjectModal';
import '../styles/ProjectGate.css';

// Gates product routes behind "the company has at least one project" —
// replaces the old silent "Default Project" auto-creation. Owners get a
// mandatory create-project form; members just wait for their owner.
export default function ProjectGate({ userId, user, children }) {
  const { projects, loading, refreshProjects } = useContext(ProjectContext);

  if (loading || projects.length > 0) {
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
