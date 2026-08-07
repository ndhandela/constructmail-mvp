import React, { useState } from 'react';
import WorkItemsTab from './WorkItemsTab';
import MilestonesTab from './MilestonesTab';
import BudgetItemsTab from './BudgetItemsTab';
import SpendByCategoryTab from './SpendByCategoryTab';

// Work Items comes first: it's the root entity now, so setting up a
// project's Capital Tracker starts with defining its work items before
// milestones or budget items — both of which require picking a work item.
const TABS = [
  { key: 'workitems', label: 'Work Items' },
  { key: 'milestones', label: 'Milestones' },
  { key: 'budget', label: 'Budget' },
  { key: 'spendbycategory', label: 'Spend by Category' },
];

// Deprecated (not removed — kept live behind the 'new_nav' flag as a
// rollback point) now that Project Detail's Budget/Schedule category cards
// reach BudgetItemsTab/SpendByCategoryTab/MilestonesTab directly (see
// modules/capital/pages/BudgetOverview.js and modules/project-hub). This
// full 4-tab dashboard, and the /capital route it lives on, keep working
// unchanged for anyone not yet on the new nav.
export default function CapitalTrackerDashboard({ userId, user, project }) {
  const [activeTab, setActiveTab] = useState('workitems');

  if (!project) return null;

  return (
    <div className="capital-dashboard">
      {user?.new_nav_enabled && (
        <p className="capital-muted" style={{ marginBottom: 12 }}>
          Budget and Schedule are also available from Project Detail now.
        </p>
      )}
      <div className="capital-tabs">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            className={`capital-tab${activeTab === tab.key ? ' capital-tab-active' : ''}`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'workitems' && <WorkItemsTab userId={userId} user={user} project={project} />}
      {activeTab === 'milestones' && <MilestonesTab userId={userId} user={user} project={project} />}
      {activeTab === 'budget' && <BudgetItemsTab userId={userId} user={user} project={project} />}
      {activeTab === 'spendbycategory' && <SpendByCategoryTab userId={userId} project={project} />}
    </div>
  );
}
