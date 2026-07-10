// ─────────────────────────────────────────────────────────────────────────────
// tileArt.jsx — inline duotone SVG illustrations for the HOME v2 module tiles.
// Pure presentational components: every shape draws in `currentColor` at layered
// opacities (the duotone), so the art inherits its hue from the tile's
// `.tile-art` container (color: var(--tile-hue)) and flips to white with the
// hover flood for free. All are aria-hidden decoration — the tile's aria-label
// carries the meaning. viewBox 0 0 48 48, sized by the container.
// ─────────────────────────────────────────────────────────────────────────────

const base = {
  viewBox: '0 0 48 48',
  fill: 'none',
  'aria-hidden': 'true',
  focusable: 'false',
}

/** Finance — rising bars + a coin. */
export function FinanceArt(props) {
  return (
    <svg {...base} {...props}>
      <rect x="6" y="27" width="8" height="15" rx="2" fill="currentColor" opacity=".25" />
      <rect x="17" y="19" width="8" height="23" rx="2" fill="currentColor" opacity=".5" />
      <rect x="28" y="11" width="8" height="31" rx="2" fill="currentColor" opacity=".85" />
      <circle cx="39.5" cy="11.5" r="6" fill="currentColor" opacity=".18" />
      <circle cx="39.5" cy="11.5" r="6" stroke="currentColor" strokeWidth="2" />
      <path d="M39.5 8.5v6M37.3 11.5h4.4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

/** Enrollment — two students + an upward funnel arrow. */
export function EnrollmentArt(props) {
  return (
    <svg {...base} {...props}>
      <circle cx="15" cy="14" r="6" fill="currentColor" opacity=".85" />
      <path d="M4 40c0-7 5-11 11-11s11 4 11 11" fill="currentColor" opacity=".5" />
      <circle cx="30" cy="17" r="5" fill="currentColor" opacity=".3" />
      <path d="M21.5 40c.5-6 4-9.5 8.5-9.5S38 34 38.5 40" fill="currentColor" opacity=".2" />
      <path d="M36 22 44 12m0 0h-6.5M44 12v6.5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/** Governance — a columned hall. */
export function GovernanceArt(props) {
  return (
    <svg {...base} {...props}>
      <path d="M24 5 42 15H6L24 5Z" fill="currentColor" opacity=".85" />
      <rect x="9" y="18" width="4.5" height="17" rx="1.5" fill="currentColor" opacity=".45" />
      <rect x="18" y="18" width="4.5" height="17" rx="1.5" fill="currentColor" opacity=".45" />
      <rect x="27" y="18" width="4.5" height="17" rx="1.5" fill="currentColor" opacity=".45" />
      <rect x="36" y="18" width="4.5" height="17" rx="1.5" fill="currentColor" opacity=".45" />
      <rect x="5" y="38" width="38" height="5" rx="2" fill="currentColor" opacity=".85" />
    </svg>
  )
}

/** Accreditation — a rosette badge with a check + ribbon tails. */
export function AccreditationArt(props) {
  return (
    <svg {...base} {...props}>
      <path d="m17 30-4 13 6.5-3.5L24 43l-2-13" fill="currentColor" opacity=".4" />
      <path d="m31 30 4 13-6.5-3.5L24 43l2-13" fill="currentColor" opacity=".25" />
      <circle cx="24" cy="19" r="13" fill="currentColor" opacity=".2" />
      <circle cx="24" cy="19" r="13" stroke="currentColor" strokeWidth="2.4" />
      <path d="m18.5 19 3.7 3.7 7.3-7.4" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/** Facilities — a building + a wrench. */
export function FacilitiesArt(props) {
  return (
    <svg {...base} {...props}>
      <rect x="8" y="12" width="20" height="30" rx="2" fill="currentColor" opacity=".3" />
      <rect x="12" y="17" width="4" height="4" rx="1" fill="currentColor" opacity=".85" />
      <rect x="20" y="17" width="4" height="4" rx="1" fill="currentColor" opacity=".85" />
      <rect x="12" y="25" width="4" height="4" rx="1" fill="currentColor" opacity=".85" />
      <rect x="20" y="25" width="4" height="4" rx="1" fill="currentColor" opacity=".85" />
      <rect x="15" y="34" width="6" height="8" rx="1" fill="currentColor" opacity=".85" />
      <path
        d="M42.5 25.5a6.5 6.5 0 0 1-8.9 6l-4.8 4.9a2.6 2.6 0 1 1-3.7-3.7l4.9-4.8a6.5 6.5 0 0 1 8-8.3l-3.6 3.6 2 3.6 3.6 2 2.5-3.3Z"
        fill="currentColor"
        opacity=".7"
      />
    </svg>
  )
}

/** Advancement — a heart + a rising gift line. */
export function AdvancementArt(props) {
  return (
    <svg {...base} {...props}>
      <path
        d="M18.5 31C12.5 26.8 6 21.7 6 15.6 6 11.4 9.4 8 13.6 8c2 0 3.8.9 4.9 2.3A6.4 6.4 0 0 1 23.4 8C27.6 8 31 11.4 31 15.6c0 6.1-6.5 11.2-12.5 15.4Z"
        fill="currentColor"
        opacity=".25"
        transform="translate(6 -3)"
      />
      <path
        d="M18.5 31C12.5 26.8 6 21.7 6 15.6 6 11.4 9.4 8 13.6 8c2 0 3.8.9 4.9 2.3A6.4 6.4 0 0 1 23.4 8C27.6 8 31 11.4 31 15.6c0 6.1-6.5 11.2-12.5 15.4Z"
        fill="currentColor"
        opacity=".8"
      />
      <path d="M26 38c4-1 8-4 11.5-9.5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      <path d="m38.5 34 .8-6.8-6.7 1.2" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/** Strategy — a target with an arrow-path into the bull's-eye. */
export function StrategyArt(props) {
  return (
    <svg {...base} {...props}>
      <circle cx="26" cy="24" r="16" fill="currentColor" opacity=".15" />
      <circle cx="26" cy="24" r="16" stroke="currentColor" strokeWidth="2.2" opacity=".6" />
      <circle cx="26" cy="24" r="9.5" stroke="currentColor" strokeWidth="2.2" opacity=".8" />
      <circle cx="26" cy="24" r="3.5" fill="currentColor" />
      <path d="M4 42c6-2 10-8 14-12l8-6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeDasharray="1 5" />
      <path d="m20.5 25.5 5.5-1.5-1.5 5.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/** HR & Staffing — an org of people. */
export function HrArt(props) {
  return (
    <svg {...base} {...props}>
      <circle cx="24" cy="11" r="6" fill="currentColor" opacity=".85" />
      <path d="M14 27c0-5.5 4.5-9 10-9s10 3.5 10 9" fill="currentColor" opacity=".6" />
      <circle cx="10" cy="26" r="5" fill="currentColor" opacity=".35" />
      <path d="M2 40c0-5 3.5-8 8-8s8 3 8 8" fill="currentColor" opacity=".25" />
      <circle cx="38" cy="26" r="5" fill="currentColor" opacity=".35" />
      <path d="M30 40c0-5 3.5-8 8-8s8 3 8 8" fill="currentColor" opacity=".25" />
    </svg>
  )
}

/** Planning & Forecasting — actuals line turning into a dashed forecast. */
export function PlanningArt(props) {
  return (
    <svg {...base} {...props}>
      <path d="M7 6v33a3 3 0 0 0 3 3h33" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" opacity=".5" />
      <path d="M12 34c4-2 7-9 11-11" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M23 23c4-2 8-7 12-13" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeDasharray="4 4.5" opacity=".7" />
      <circle cx="23" cy="23" r="3" fill="currentColor" />
      <circle cx="35" cy="10" r="2.5" fill="currentColor" opacity=".5" />
    </svg>
  )
}
