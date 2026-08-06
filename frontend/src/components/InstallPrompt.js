import React, { useEffect, useState } from 'react';
import { useInstallPrompt } from '../contexts/InstallPromptContext';
import { IOSInstallIcon, IOS_INSTALL_HEADING, IOS_INSTALL_COPY } from './IOSInstallSteps';
import '../styles/InstallPrompt.css';

const IOS_DISMISSED_KEY = 'pomar_install_banner_ios_dismissed';
const ANDROID_DISMISSED_KEY = 'pomar_install_banner_android_dismissed';

// Custom "Install POMAR" banner (Android/Chrome via beforeinstallprompt) and
// the iOS Safari instructional banner (Safari toolbar Share icon → "Add to
// Home Screen") — iOS never fires beforeinstallprompt, there's no
// programmatic install flow there, so the iOS banner never renders a
// tappable install control, only instructional text + an inert icon.
// Mounted once in AppLayout so it's consistent across
// every authenticated product module. Both dismiss permanently via
// localStorage so this never nags on every visit; the permanent "How to
// Install the App" entry in the profile menu (InstallHelpModal.js) is the
// way to retrieve these instructions again after dismissing. Platform
// detection and the deferred install-prompt event both come from
// InstallPromptContext, shared with that modal rather than duplicated here.
export default function InstallPrompt() {
  const { isStandalone, isIOSSafari, canPromptInstall, promptInstall } = useInstallPrompt();
  const [showAndroidBanner, setShowAndroidBanner] = useState(false);
  const [showIOSBanner, setShowIOSBanner] = useState(false);

  useEffect(() => {
    if (isStandalone) return;

    // iOS is authoritative: there is no programmatic install trigger there
    // (beforeinstallprompt never fires on iOS Safari), so if isIOSSafari is
    // true this must always be the instructional banner and never the
    // Android CTA-button banner below — regardless of what canPromptInstall
    // happens to be. A stray/misdetected beforeinstallprompt firing on iOS
    // (e.g. a spoofed UA, an in-app browser) must not surface a dead
    // "Install" button.
    if (isIOSSafari) {
      if (!localStorage.getItem(IOS_DISMISSED_KEY)) setShowIOSBanner(true);
      return;
    }

    if (!localStorage.getItem(ANDROID_DISMISSED_KEY) && canPromptInstall) {
      setShowAndroidBanner(true);
    }
  }, [isStandalone, isIOSSafari, canPromptInstall]);

  const handleInstallClick = async () => {
    await promptInstall();
    setShowAndroidBanner(false);
  };

  const dismissAndroid = () => {
    localStorage.setItem(ANDROID_DISMISSED_KEY, '1');
    setShowAndroidBanner(false);
  };

  const dismissIOS = () => {
    localStorage.setItem(IOS_DISMISSED_KEY, '1');
    setShowIOSBanner(false);
  };

  // iOS checked first — on iOS this must always win over the Android
  // CTA-button banner (see the effect above), never the other way around.
  if (showIOSBanner) {
    return (
      <div className="install-banner" role="region" aria-label="Add POMAR to Home Screen">
        {/* Visual label only — a copy of Safari's own toolbar icon, not a
            control for it. No onClick, no button wrapper, no pointer
            cursor (see IOSInstallSteps.js): iOS has no programmatic
            install trigger, so nothing here can act as one. */}
        <div className="install-banner-icon install-banner-icon-static">
          <IOSInstallIcon />
        </div>
        <div className="install-banner-text">
          <strong>{IOS_INSTALL_HEADING}</strong>
          <span>{IOS_INSTALL_COPY}</span>
        </div>
        <button type="button" className="install-banner-dismiss" onClick={dismissIOS} aria-label="Dismiss">
          ×
        </button>
      </div>
    );
  }

  if (showAndroidBanner) {
    return (
      <div className="install-banner" role="region" aria-label="Install POMAR">
        <div className="install-banner-icon" aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
            <g transform="translate(50,50)">
              <circle r="38.16" fill="none" stroke="#0E1B2C" strokeWidth="11.69" />
              <circle r="16.07" fill="none" stroke="#D97706" strokeWidth="5.84" />
              <circle r="8.47" fill="#D97706" />
            </g>
          </svg>
        </div>
        <div className="install-banner-text">
          <strong>Install POMAR</strong>
          <span>Add to your home screen for quick, full-screen access.</span>
        </div>
        <button type="button" className="install-banner-cta" onClick={handleInstallClick}>
          Install
        </button>
        <button type="button" className="install-banner-dismiss" onClick={dismissAndroid} aria-label="Dismiss">
          ×
        </button>
      </div>
    );
  }

  return null;
}
