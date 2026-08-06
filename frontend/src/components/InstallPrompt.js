import React, { useEffect, useState } from 'react';
import '../styles/InstallPrompt.css';

const IOS_DISMISSED_KEY = 'pomar_install_banner_ios_dismissed';
const ANDROID_DISMISSED_KEY = 'pomar_install_banner_android_dismissed';

function isStandalone() {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
  );
}

function isIOSSafari() {
  const ua = window.navigator.userAgent;
  // iPadOS 13+ reports as "Macintosh" with touch support, not "iPad" —
  // maxTouchPoints is the standard way to still catch it.
  const isIOS = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  // Exclude other iOS browsers (Chrome/Firefox/Edge on iOS all use
  // WebKit and include "Safari" in the UA too) — none of them expose
  // beforeinstallprompt or a native install flow, and "Tap Share, then Add
  // to Home Screen" is Safari-chrome-specific instructions that don't
  // apply to those browsers' UI.
  const isSafari = /safari/i.test(ua) && !/crios|fxios|edgios|opios/i.test(ua);
  return isIOS && isSafari;
}

// Custom "Install POMAR" banner (Android/Chrome via beforeinstallprompt) and
// the iOS Safari instructional banner ("Tap Share, then Add to Home
// Screen") — iOS never fires beforeinstallprompt, there's no programmatic
// install flow there. Mounted once in AppLayout so it's consistent across
// every authenticated product module. Both dismiss permanently via
// localStorage so this never nags on every visit.
export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showAndroidBanner, setShowAndroidBanner] = useState(false);
  const [showIOSBanner, setShowIOSBanner] = useState(false);

  useEffect(() => {
    if (isStandalone()) return undefined;

    if (!localStorage.getItem(IOS_DISMISSED_KEY) && isIOSSafari()) {
      setShowIOSBanner(true);
    }

    if (localStorage.getItem(ANDROID_DISMISSED_KEY)) return undefined;

    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowAndroidBanner(true);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
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

  if (showIOSBanner) {
    return (
      <div className="install-banner" role="region" aria-label="Add POMAR to Home Screen">
        <div className="install-banner-icon" aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0E1B2C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3v12" />
            <path d="m8 7 4-4 4 4" />
            <path d="M4 14v5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5" />
          </svg>
        </div>
        <div className="install-banner-text">
          <strong>Add POMAR to your Home Screen</strong>
          <span>Tap Share, then "Add to Home Screen".</span>
        </div>
        <button type="button" className="install-banner-dismiss" onClick={dismissIOS} aria-label="Dismiss">
          ×
        </button>
      </div>
    );
  }

  return null;
}
