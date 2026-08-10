import React, { useState } from 'react';
import BudgetItemsTab from './BudgetItemsTab';
import SpendByCategoryTab from './SpendByCategoryTab';
import PageHeader from '../../../components/PageHeader';
import '../styles/CapitalTrackerApp.css';

// Project Detail's "Budget" card reuses these same two Capital Tracker tabs
// directly rather than the full CapitalTrackerDashboard (which also has
// Work Items and Milestones — Milestones gets its own "Schedule" card, and
// Work Items isn't part of the budget view Project Detail links to).
const TABS = [
  { key: 'budget', label: 'Budget' },
  { key: 'spendbycategory', label: 'Spend by Category' },
];

export default function BudgetOverview({ userId, user, project, backLabel, onBack }) {
  const [activeTab, setActiveTab] = useState('budget');

  if (!project) return null;

  return (
    <div className="capital-dashboard">
      <PageHeader
        backLabel={backLabel}
        onBack={onBack}
        title="Budget"
        tabs={TABS.map((tab) => ({
          key: tab.key,
          label: tab.label,
          active: activeTab === tab.key,
          onClick: () => setActiveTab(tab.key),
        }))}
      />

      {activeTab === 'budget' && <BudgetItemsTab userId={userId} user={user} project={project} />}
      {activeTab === 'spendbycategory' && <SpendByCategoryTab userId={userId} project={project} />}
    </div>
  );
}
