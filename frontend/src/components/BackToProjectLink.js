import React from 'react';
import '../styles/BackToProjectLink.css';

// Every standalone app page (Capital Tracker, Daily Logs, Invoices,
// Documents) can now be reached from Project Detail's category cards, but
// getting there is a full page nav (no client router), so there's no
// automatic way back. Only shown once an account is on the new nav — for
// unflagged accounts Project Detail isn't the way anyone got here, so the
// link would just be confusing chrome pointing at a page they don't use.
export default function BackToProjectLink({ user, projectName }) {
  if (!user?.new_nav_enabled) return null;
  return (
    <a href="/project" className="back-to-project-link">
      &larr; Back to {projectName || 'Project'}
    </a>
  );
}
