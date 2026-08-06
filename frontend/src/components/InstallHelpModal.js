import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useInstallPrompt } from '../contexts/InstallPromptContext';
import { IOSInstallIcon, IOS_INSTALL_HEADING, IOS_INSTALL_COPY } from './IOSInstallSteps';
import '../styles/Header.css';

// Reachable from the profile menu ("How to Install the App") so instructions
// are never lost once the one-time banner (InstallPrompt.js) gets dismissed.
// Reuses the same platform detection + deferred-prompt event from
// InstallPromptContext and the same iOS copy/icon as the banner — this file
// only adds the container and the per-platform message around them.
export default function InstallHelpModal({ onClose }) {
  const { isStandalone, isIOSSafari, canPromptInstall, promptInstall } = useInstallPrompt();
  const [outcome, setOutcome] = useState(null); // null | 'accepted' | 'dismissed'

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleInstallClick = async () => {
    const result = await promptInstall();
    setOutcome(result);
  };

  let body;
  if (isStandalone) {
    body = <p className="new-project-label">POMAR is already installed on this device.</p>;
  } else if (isIOSSafari) {
    body = (
      <div className="install-banner-text" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <IOSInstallIcon size={24} />
        <div>
          <strong style={{ display: 'block', marginBottom: 4 }}>{IOS_INSTALL_HEADING}</strong>
          <span>{IOS_INSTALL_COPY}</span>
        </div>
      </div>
    );
  } else if (outcome === 'accepted') {
    body = <p className="new-project-label">Installing POMAR — check your home screen or app list shortly.</p>;
  } else if (canPromptInstall) {
    body = (
      <>
        <p className="new-project-label">Add POMAR to your device for quick, full-screen access.</p>
        <button type="button" className="install-banner-cta" onClick={handleInstallClick}>
          Install POMAR
        </button>
      </>
    );
  } else {
    body = (
      <p className="new-project-label">
        POMAR isn't currently offering an install prompt on this browser. Open your browser's menu
        and look for "Install app" or "Add to Home Screen" — or check back after using the site a bit more.
      </p>
    );
  }

  return createPortal(
    <div className="new-project-overlay" onClick={onClose}>
      <div className="new-project-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="How to install POMAR">
        <div className="new-project-header">
          <h3>How to Install the App</h3>
          <button type="button" className="new-project-close-btn" onClick={onClose} aria-label="Close">×</button>
        </div>
        {body}
      </div>
    </div>,
    document.body
  );
}
