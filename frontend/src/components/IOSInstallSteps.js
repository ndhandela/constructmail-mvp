import React from 'react';

// The iOS Safari "Add to Home Screen" icon + copy — single source of truth
// shared by the install banner (InstallPrompt.js) and the permanent "How to
// Install the App" entry (InstallHelpModal.js), since iOS never fires
// beforeinstallprompt: there is no programmatic install trigger on iOS, so
// this is instructional-only content, never a tappable control. Each caller
// wraps these in its own layout markup rather than a shared container,
// since the banner and the modal lay them out differently — but both must
// render the icon as inert (no onClick, no button wrapper, no pointer
// cursor) since it's a copy of Safari's own toolbar icon, not a stand-in
// for it.
export const IOS_INSTALL_HEADING = 'Add POMAR to your Home Screen';
export const IOS_INSTALL_COPY = 'Tap the Share icon in Safari’s toolbar, then "Add to Home Screen".';

export function IOSInstallIcon({ size = 20 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="#0E1B2C"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ pointerEvents: 'none' }}
    >
      <path d="M12 3v12" />
      <path d="m8 7 4-4 4 4" />
      <path d="M4 14v5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5" />
    </svg>
  );
}
