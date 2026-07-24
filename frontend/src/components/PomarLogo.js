import React from 'react';

/**
 * POMAR Logo · single source of truth for the wordmark
 *
 * Letterforms are baked in as vector outlines (extracted from Space Grotesk
 * Bold via fontTools), not live <text>, so rendering never depends on the
 * font being loaded — guarantees the logo looks identical everywhere, with
 * no fallback-font risk.
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
          <circle r="34.69" fill="none" stroke={ringOuter} strokeWidth="10.62" />
          <circle r="14.61" fill="none" stroke={ringInner} strokeWidth="5.31" />
          <circle r="7.70" fill={ringInner} />
        </g>
      </svg>
    );
  }

  return (
    <svg
      height={height}
      viewBox="0 0 3468.0 740.0"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="POMAR"
    >
      <g transform="matrix(1,0,0,-1,20,720.0)">
        <path transform="translate(0,0)" d="M66 0V700H354Q420 700 470.5 673.5Q521 647 549.5 599.0Q578 551 578 485V471Q578 406 548.5 357.5Q519 309 468.5 282.5Q418 256 354 256H198V0ZM198 376H341Q388 376 417.0 402.0Q446 428 446 473V483Q446 528 417.0 554.0Q388 580 341 580H198Z" fill={letterColor} />
        <path transform="translate(1280,0)" d="M66 0V700H311L432 90H450L571 700H816V0H688V603H670L550 0H332L212 603H194V0Z" fill={letterColor} />
        <path transform="translate(2162,0)" d="M18 0 202 700H432L616 0H480L442 154H192L154 0ZM223 276H411L326 617H308Z" fill={letterColor} />
        <path transform="translate(2796,0)" d="M66 0V700H370Q436 700 485.0 677.0Q534 654 561.0 612.0Q588 570 588 513V501Q588 438 558.0 399.0Q528 360 484 342V324Q524 322 546.0 296.5Q568 271 568 229V0H436V210Q436 234 423.5 249.0Q411 264 382 264H198V0ZM198 384H356Q403 384 429.5 409.5Q456 435 456 477V487Q456 529 430.0 554.5Q404 580 356 580H198Z" fill={letterColor} />
        <g transform="translate(942.0,350.0)">
          <circle r="282.3" fill="none" stroke={ringOuter} strokeWidth="86.4" />
          <circle r="118.9" fill="none" stroke={ringInner} strokeWidth="43.2" />
          <circle r="62.7" fill={ringInner} />
        </g>
      </g>
    </svg>
  );
}
