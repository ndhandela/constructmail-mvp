import React, { useContext } from 'react';
import ModuleLockedNotice, { isModuleLocked } from '../../../components/ModuleLockedNotice';
import PageHeader from '../../../components/PageHeader';
import { ProjectContext, ALL_PROJECTS } from '../../../contexts/ProjectContext';
import WorkItemsTab from './WorkItemsTab';
import '../styles/CapitalTrackerApp.css';

// Standalone Work Items app — work_items is Capital Tracker's root entity
// (milestones and budget items each require a work_item_id), but it's
// surfaced here as its own page/route rather than folded into Budget or
// Schedule, since setting up a project's work items is a prerequisite step
// for both, not part of either. Gated by the same 'capital' feature flag as
// the rest of Capital Tracker — no separate flag or license.
export default function WorkItemsApp({ user, userId }) {
  const workItemsLocked = isModuleLocked(user?.active_modules, 'capital');

  // Project selection comes from the shared header/sidebar switcher, same
  // as Capital Tracker/Daily Logs/Invoice Tracker — no separate in-page picker.
  const { projects, currentProjectId } = useContext(ProjectContext);
  const selectedProject = currentProjectId !== ALL_PROJECTS
    ? projects.find((p) => String(p.id) === String(currentProjectId))
    : null;

  if (workItemsLocked) {
    return (
      <div className="capital-dashboard">
        <ModuleLockedNotice
          moduleName="POMAR Capital Tracker"
          companyName={user?.company}
          variant="upgrade"
          icon="💰"
          description="Define named work items for a project, then hang milestones and budget items off them. Upgrade your plan to unlock Capital Tracker."
        />
      </div>
    );
  }

  return (
    <div className="capital-dashboard">
      <PageHeader
        backLabel={`Back to ${selectedProject?.name || 'Project'}`}
        backHref={user?.new_nav_enabled ? '/project' : undefined}
        title="Work Items"
      />

      {!selectedProject ? (
        <p className="capital-muted">Select a project from the header to view its work items.</p>
      ) : (
        <WorkItemsTab userId={userId} user={user} project={selectedProject} hideHeading />
      )}
    </div>
  );
}
