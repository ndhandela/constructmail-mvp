import React, { useState } from 'react';
import BudgetItemsTab from './BudgetItemsTab';
import SpendByCategoryTab from './SpendByCategoryTab';
import '../styles/CapitalTrackerApp.css';

// Project Detail's "Budget" card reuses these same two Capital Tracker tabs
// directly rather than the full CapitalTrackerDashboard (which also has
// Work Items and Milestones — Milestones gets its own "Schedule" card, and
// Work Items isn't part of the budget view Project Detail links to).
const TABS = [
  { key: 'budget', label: 'Budget' },
  { key: 'spendbycategory', label: 'Spend by Category' },
];

export default function BudgetOverview({ userId, user, project }) {
  const [activeTab, setActiveTab] = useState('budget');

  if (!project) return null;

  return (
    <div className="capital-dashboard">
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

      {activeTab === 'budget' && <BudgetItemsTab userId={userId} user={user} project={project} />}
      {activeTab === 'spendbycategory' && <SpendByCategoryTab userId={userId} project={project} />}
    </div>
  );
}
