import React from 'react';
import '../styles/PageHeader.css';

// Canonical page header: breadcrumb back-link, left-aligned bold title (with
// an optional right-aligned orange action button on the same row), and
// optional sub-tabs below. Matches Budget's header exactly (see
// modules/capital/pages/BudgetOverview.js) — reused as-is for Invoice
// Tracker so both pages read as the same layout.
export default function PageHeader({
  backLabel,
  backHref,
  onBack,
  title,
  tabs,
  actionLabel,
  onAction,
  actionDisabled,
  actionTitle,
}) {
  const showBack = !!(backHref || onBack);

  return (
    <div className="page-header">
      {showBack && (
        backHref ? (
          <a href={backHref} className="page-header-back">&larr; {backLabel}</a>
        ) : (
          <button type="button" className="page-header-back" onClick={onBack}>
            &larr; {backLabel}
          </button>
        )
      )}

      <div className="page-header-title-row">
        <h1 className="page-header-title">{title}</h1>
        {actionLabel && (
          <button
            type="button"
            className="page-header-action"
            onClick={onAction}
            disabled={actionDisabled}
            title={actionTitle}
          >
            {actionLabel}
          </button>
        )}
      </div>

      {tabs && tabs.length > 0 && (
        <div className="page-header-tabs">
          {tabs.map((tab) => (
            <button
              key={tab.key || tab.label}
              type="button"
              className={`page-header-tab${tab.active ? ' page-header-tab-active' : ''}`}
              onClick={tab.onClick}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
