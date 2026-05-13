import React from 'react';

/**
 * POMAR Logo · single source of truth for the wordmark
 *
 * Props:
 *   variant: 'light' | 'dark' | 'saffron' (default: 'light')
 *   height: number in px (default: 36)
 *   markOnly: boolean — show only the O stamp without the wordmark (default: false)
 */
export default function PomarLogo({ variant = 'light', height = 36, markOnly = false }) {
  const letterColor = variant === 'dark' ? '#FAF7F2' : '#0E1B2C';
  const ringOuter = variant === 'dark' ? '#FAF7F2' : '#0E1B2C';
  const ringInner = variant === 'saffron' ? '#FAF7F2' : '#D97706';
  
  if (markOnly) {
    return (
      <svg
        height={height}
        viewBox="0 0 200 200"
        xmlns="http://www.w3.org/2000/svg"
        aria-label="POMAR"
      >
        <circle cx="100" cy="100" r="80" fill="none" stroke={ringOuter} strokeWidth="22" />
        <circle cx="100" cy="100" r="42" fill="none" stroke={ringInner} strokeWidth="9" />
        <circle cx="100" cy="100" r="16" fill={ringInner} />
      </svg>
    );
  }
  
  return (
    <svg
      height={height}
      viewBox="0 0 500 120"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="POMAR"
    >
      <text
        x="0"
        y="92"
        fontFamily="Helvetica Neue, Arial, sans-serif"
        fontWeight="700"
        fontSize="100"
        fill={letterColor}
        letterSpacing="-4"
      >
        P
      </text>
      <g transform="translate(78, 16)">
        <circle cx="40" cy="40" r="36" fill="none" stroke={ringOuter} strokeWidth="10" />
        <circle cx="40" cy="40" r="19" fill="none" stroke={ringInner} strokeWidth="4" />
        <circle cx="40" cy="40" r="7" fill={ringInner} />
      </g>
      <text
        x="166"
        y="92"
        fontFamily="Helvetica Neue, Arial, sans-serif"
        fontWeight="700"
        fontSize="100"
        fill={letterColor}
        letterSpacing="-4"
      >
        MAR
      </text>
    </svg>
  );
}
