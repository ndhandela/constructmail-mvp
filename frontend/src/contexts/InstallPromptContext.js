import React, { createContext, useContext, useCallback, useEffect, useState } from 'react';

const InstallPromptContext = createContext(null);

export function isStandaloneDisplay() {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
  );
}

export function isIOSSafariBrowser() {
  const ua = window.navigator.userAgent;
  // iPadOS 13+ reports as "Macintosh" with touch support, not "iPad" —
  // maxTouchPoints is the standard way to still catch it.
  const isIOS = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  // Exclude other iOS browsers (Chrome/Firefox/Edge on iOS all use
  // WebKit and include "Safari" in the UA too) — none of them expose
  // beforeinstallprompt or a native install flow, and "Tap the Share icon
  // in Safari's toolbar" is Safari-chrome-specific instructions that don't
  // apply to those browsers' UI.
  const isSafari = /safari/i.test(ua) && !/crios|fxios|edgios|opios/i.test(ua);
  return isIOS && isSafari;
}

// Single source of truth for "can/should this device install POMAR" state
// — captures the one-shot beforeinstallprompt event and exposes platform
// detection, shared by the install banner (InstallPrompt.js) and the
// permanent "How to Install the App" entry in the profile menu
// (InstallHelpModal.js) so neither duplicates the other's logic. Mounted
// once in AppLayout, above both.
export function InstallPromptProvider({ children }) {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [standalone, setStandalone] = useState(isStandaloneDisplay());

  useEffect(() => {
    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    const handleAppInstalled = () => {
      setDeferredPrompt(null);
      setStandalone(true);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const promptInstall = useCallback(async () => {
    if (!deferredPrompt) return 'unavailable';
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    return outcome; // 'accepted' | 'dismissed'
  }, [deferredPrompt]);

  const value = {
    isStandalone: standalone,
    isIOSSafari: isIOSSafariBrowser(),
    canPromptInstall: deferredPrompt !== null,
    promptInstall,
  };

  return (
    <InstallPromptContext.Provider value={value}>
      {children}
    </InstallPromptContext.Provider>
  );
}

export function useInstallPrompt() {
  const ctx = useContext(InstallPromptContext);
  if (!ctx) {
    throw new Error('useInstallPrompt must be used within an InstallPromptProvider');
  }
  return ctx;
}
