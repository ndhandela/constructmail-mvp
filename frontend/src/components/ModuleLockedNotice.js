import React from 'react';
import '../styles/ModuleLockedNotice.css';

// A company's active_modules is only meaningful once it has a company_id —
// legacy accounts predating the company model get back an empty object from
// the API and are treated as full access, not "locked" (see
// services/access_control.py's require_feature_flag on the backend).
export function isModuleLocked(activeModules, key) {
  if (!activeModules || Object.keys(activeModules).length === 0) return false;
  return !activeModules[key];
}

export default function ModuleLockedNotice({ moduleName, companyName }) {
  const subject = encodeURIComponent(
    `Enable ${moduleName}${companyName ? ` for ${companyName}` : ''}`
  );

  return (
    <div className="module-locked-notice">
      <div className="module-locked-notice-content">
        <h2>{moduleName} isn't enabled for your account yet</h2>
        <p>Reach out to your POMAR contact to get this added.</p>
        <a
          className="module-locked-notice-cta"
          href={`mailto:connect@techdensolutions.com?subject=${subject}`}
        >
          Email connect@techdensolutions.com
        </a>
      </div>
    </div>
  );
}
