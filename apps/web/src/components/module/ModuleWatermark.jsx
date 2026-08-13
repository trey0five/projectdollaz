// ─────────────────────────────────────────────────────────────────────────────
// ModuleWatermark — the oversized mark that gives a module banner its identity.
//
// DRAWN, NOT LOADED. An SVG stays crisp at any size, inherits currentColor so it
// themes for free, adds no request and cannot 404 — and the whole point of a
// watermark is that it is enormous, which is exactly where a raster starts to
// show its seams.
//
// The rules that make a watermark read as designed rather than pasted on:
//   • It BLEEDS off the edge. A mark floating fully inside its box looks like a
//     sticker; one cropped by the frame looks like the frame was built for it.
//   • It is BOLD and SIMPLE. At 6–10% opacity every interior detail turns to
//     mush, so each mark here is one silhouette, not an illustration.
//   • It carries the module's own meaning. Academics is a book whose pages rise
//     into a bar chart — the module measures teaching, so the mark is both.
// ─────────────────────────────────────────────────────────────────────────────

/** One 200×140 viewBox per module. Keep them silhouette-simple. */
const MARKS = {
  // An open book, its right page rising into score bars.
  academics: (
    <>
      <path
        d="M100 36C70 22 40 18 10 20v78c30-2 60 2 90 16V36Z"
        fill="currentColor"
        opacity="0.55"
      />
      <path
        d="M100 36c30-14 60-18 90-16v78c-30-2-60 2-90 16V36Z"
        fill="currentColor"
        opacity="0.32"
      />
      <g fill="currentColor">
        <rect x="120" y="62" width="11" height="30" rx="2.5" opacity="0.8" />
        <rect x="139" y="49" width="11" height="43" rx="2.5" opacity="0.9" />
        <rect x="158" y="33" width="11" height="59" rx="2.5" />
      </g>
    </>
  ),
  // A rising column with a trend line breaking out of it.
  finance: (
    <>
      <g fill="currentColor">
        <rect x="16" y="86" width="22" height="42" rx="4" opacity="0.45" />
        <rect x="48" y="66" width="22" height="62" rx="4" opacity="0.6" />
        <rect x="80" y="78" width="22" height="50" rx="4" opacity="0.5" />
        <rect x="112" y="44" width="22" height="84" rx="4" opacity="0.75" />
        <rect x="144" y="24" width="22" height="104" rx="4" />
      </g>
      <path
        d="M20 96 60 72 92 84 124 50 168 26"
        fill="none"
        stroke="currentColor"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.55"
      />
    </>
  ),
  // Three figures, the middle one forward.
  enrollment: (
    <g fill="currentColor">
      <circle cx="44" cy="46" r="19" opacity="0.4" />
      <path d="M12 128c0-19 14-32 32-32s32 13 32 32H12Z" opacity="0.4" />
      <circle cx="156" cy="46" r="19" opacity="0.4" />
      <path d="M124 128c0-19 14-32 32-32s32 13 32 32h-64Z" opacity="0.4" />
      <circle cx="100" cy="38" r="24" />
      <path d="M60 130c0-23 18-40 40-40s40 17 40 40H60Z" />
    </g>
  ),
  // A shield — governance, accreditation, anything that certifies.
  governance: (
    <path
      d="M100 12 178 40v44c0 34-30 60-78 72-48-12-78-38-78-72V40l78-28Z"
      fill="currentColor"
    />
  ),
}

/** The default mark: an abstract data bloom, for modules with no glyph yet. */
const FALLBACK = (
  <g fill="currentColor">
    <circle cx="100" cy="70" r="52" opacity="0.28" />
    <circle cx="100" cy="70" r="32" opacity="0.4" />
    <circle cx="100" cy="70" r="14" />
  </g>
)

/**
 * @param {object}  props
 * @param {string}  props.module   Module key — academics, finance, enrollment…
 * @param {string} [props.className] Positioning/sizing. The caller owns placement.
 * @param {number} [props.opacity]  Whole-mark opacity. Keep it low; 0.07 is the
 *                                  default because the mark is texture, not art.
 */
export default function ModuleWatermark({ module, className = '', opacity = 0.07 }) {
  return (
    <svg
      viewBox="0 0 200 140"
      aria-hidden="true"
      focusable="false"
      className={`pointer-events-none select-none ${className}`}
      style={{ opacity }}
    >
      {MARKS[module] ?? FALLBACK}
    </svg>
  )
}
