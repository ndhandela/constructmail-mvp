import React, { useContext, useRef } from 'react';
import ModuleLockedNotice, { isModuleLocked } from '../../../components/ModuleLockedNotice';
import PageHeader from '../../../components/PageHeader';
import { ProjectContext, ALL_PROJECTS } from '../../../contexts/ProjectContext';
import { isProjectOwner } from '../capitalUtils';
import WorkItemsTab from './WorkItemsTab';
import '../styles/CapitalTrackerApp.css';

// Standalone Work Items app — work_items is Capital Tracker's root entity
// (milestones and budget items each require a work_item_id), but it's
// surfaced here as its own page/route rather than folded into Budget or
// Schedule, since setting up a project's work items is a prerequisite step
// for both, not part of either. Gated by the same 'capital' feature flag as
// the rest of Capital Tracker — no separate flag or license. Uses the same
// capital-app/capital-container wrapper as CapitalTrackerApp.js (padding,
// max-width, centering) rather than the unstyled capital-dashboard div.
export default function WorkItemsApp({ user, userId }) {
  const workItemsLocked = isModuleLocked(user?.active_modules, 'capital');

  // Project selection comes from the shared header/sidebar switcher, same
  // as Capital Tracker/Daily Logs/Invoice Tracker — no separate in-page picker.
  const { projects, currentProjectId } = useContext(ProjectContext);
  const selectedProject = currentProjectId !== ALL_PROJECTS
    ? projects.find((p) => String(p.id) === String(currentProjectId))
    : null;

  // WorkItemsTab owns its own create/edit form state (it's also embedded,
  // unwrapped, inside the old Capital Tracker dashboard tabs) — this ref
  // just lets PageHeader's inline action button open it, so "+ Add work
  // item" sits in the title row like Invoices/Daily Logs/Documents/Permits
  // instead of in a second row of its own.
  const workItemsRef = useRef(null);
  const canEdit = isProjectOwner(selectedProject, user);

  if (workItemsLocked) {
    return (
      <div className="capital-app">
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
    <div className="capital-app">
      <div className="capital-container">
        <PageHeader
          backLabel={`Back to ${selectedProject?.name || 'Project'}`}
          backHref={user?.new_nav_enabled ? '/project' : undefined}
          title="Work Items"
          actionLabel={selectedProject && canEdit ? '+ Add work item' : undefined}
          onAction={() => workItemsRef.current?.openCreateForm()}
        />

        {!selectedProject ? (
          <p className="capital-muted">Select a project from the header to view its work items.</p>
        ) : (
          <WorkItemsTab ref={workItemsRef} userId={userId} user={user} project={selectedProject} hideHeading />
        )}
      </div>
    </div>
  );
}
