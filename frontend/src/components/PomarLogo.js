import React from 'react';

/**
 * POMAR Logo · single source of truth for the wordmark
 *
 * Letterforms are baked in as vector outlines (extracted from Poppins Bold),
 * not live <text>, so rendering never depends on the font being loaded —
 * guarantees the logo looks identical everywhere, with no fallback-font risk.
 *
 * Props:
 *   variant: 'light' | 'dark' | 'saffron' (default: 'light')
 *   height: number in px (default: 36)
 *   markOnly: boolean — show only the ring stamp without the wordmark (default: false)
 */
export default function PomarLogo({ variant = 'light', height = 36, markOnly = false }) {
  const letterColor = variant === 'dark' ? '#FAF7F2' : '#0E1B2C';
  const ringOuter = variant === 'dark' ? '#FAF7F2' : '#0E1B2C';
  const ringInner = variant === 'saffron' ? '#FAF7F2' : '#D97706';

  if (markOnly) {
    return (
      <svg
        height={height}
        viewBox="0 0 100 100"
        xmlns="http://www.w3.org/2000/svg"
        aria-label="POMAR"
      >
        <g transform="translate(50,50)">
          <circle r="34.95" fill="none" stroke={ringOuter} strokeWidth="10.70" />
          <circle r="14.72" fill="none" stroke={ringInner} strokeWidth="5.35" />
          <circle r="7.76" fill={ringInner} />
        </g>
      </svg>
    );
  }

  return (
    <svg
      height={height}
      viewBox="85 55 1535 315"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="POMAR"
    >
      <path d="M321.443 160.706Q321.443 186.265 309.711 207.424Q297.979 228.584 273.677 241.573Q249.375 254.562 213.341 254.562L168.927 254.562L168.927 360.150L97.278 360.150L97.278 66.012L213.341 66.012Q248.537 66.012 272.839 78.163Q297.141 90.314 309.292 111.683Q321.443 133.052 321.443 160.706M207.894 197.578Q228.425 197.578 238.481 187.941Q248.537 178.304 248.537 160.706Q248.537 143.108 238.481 133.471Q228.425 123.834 207.894 123.834L168.927 123.834L168.927 197.578" fill={letterColor} />
      <path d="M936.864 66.012L1021.083 66.012L1021.083 360.150L949.434 360.150L949.434 183.751L883.651 360.150L825.829 360.150L759.627 183.332L759.627 360.150L687.978 360.150L687.978 66.012L772.616 66.012L855.159 269.646L936.864 66.012M1273.321 360.150L1255.723 308.194L1145.945 308.194L1128.347 360.150L1053.346 360.150L1159.772 66.012L1242.734 66.012L1349.160 360.150L1273.321 360.150M1164.800 252.886L1237.287 252.886L1200.834 145.203L1164.800 252.886M1612.292 360.150L1531.425 360.150L1470.251 249.115L1453.072 249.115L1453.072 360.150L1381.423 360.150L1381.423 66.012L1501.676 66.012Q1536.453 66.012 1560.965 78.163Q1585.476 90.314 1597.627 111.473Q1609.778 132.633 1609.778 158.611Q1609.778 187.941 1593.228 210.986Q1576.677 234.031 1544.414 243.668L1612.292 360.150M1453.072 125.510L1453.072 198.416L1497.486 198.416Q1517.179 198.416 1527.026 188.779Q1536.872 179.142 1536.872 161.544Q1536.872 144.784 1527.026 135.147Q1517.179 125.510 1497.486 125.510" fill={letterColor} />
      <g transform="translate(505.4,210)">
        <circle r="130.6" fill="none" stroke={ringOuter} strokeWidth="40" />
        <circle r="55" fill="none" stroke={ringInner} strokeWidth="20" />
        <circle r="29" fill={ringInner} />
      </g>
    </svg>
  );
}
