// ─────────────────────────────────────────────────────────────────────────────
// SchoolCrest — the school's identity panel on the right of the briefing band.
//
// A school HAS a logo field already: `logoBase64`, added for board-report
// branding, and it rides along with every school in the roster payload. So the
// panel uses the real mark whenever one has been uploaded.
//
// The interesting case is the other one, which is most schools. A blank square
// would read as a loading state, so an absent logo becomes a MONOGRAM — the
// school's own initials, drawn at watermark scale. Two rules make that read as
// a mark rather than as fallback text:
//
//   • The initials skip the words every school in a diocese shares. "St Thomas
//     Aquinas Catholic School" is STA, not STACS, because "Catholic School"
//     distinguishes nothing where half the network carries it.
//   • It BLEEDS off the right edge behind a scrim, exactly as a real logo does.
//     Swapping a genuine logo in later changes the picture, not the layout.
//
// The panel is deliberately not a badge with a caption. A caption that reads
// the same on every school ("This school") is one the eye learns to skip — so
// the only text here is the school's own name and, when the record carries it,
// something true about that school in particular.
// ─────────────────────────────────────────────────────────────────────────────

/** Words that carry no identity in a school name — dropped from the monogram. */
const NOISE = new Set([
  'the', 'of', 'and', 'a', 'at',
  'school', 'schools', 'academy', 'catholic', 'college', 'prep', 'preparatory',
  'high', 'elementary', 'middle', 'junior', 'senior', 'regional', 'parish',
  'sr', 'jr', 'inc',
])

/**
 * Up to three initials from the distinctive words of a school name.
 * "Our Lady of Perpetual Help Academy" → OLP · "Nativity Catholic School" → N
 */
export function monogramOf(name) {
  const words = String(name ?? '')
    .replace(/[^\p{L}\p{N}\s'-]/gu, ' ')
    // Hyphens split too: "Chaminade-Madonna College Prep" is one WORD to a space
    // split, so the mark came out as a lone "C" while the two halves of the name
    // are the whole of what distinguishes it. Apostrophes do not split — O'Brien
    // is one name, not two.
    .split(/[\s-]+/)
    .filter(Boolean)
  const distinctive = words.filter((w) => !NOISE.has(w.toLowerCase()))
  const source = distinctive.length > 0 ? distinctive : words
  return source.slice(0, 3).map((w) => w[0].toUpperCase()).join('') || '·'
}

/**
 * A line that is TRUE OF THIS SCHOOL, or nothing at all.
 *
 * The first version of this panel printed "This school" under every name, which
 * is text that costs a line and tells the reader something they already knew —
 * and reads identically on all sixteen schools, which is what made it feel
 * wrong. These fields are nullable and mostly unset, so the honest default is
 * silence.
 */
/** The stored value is a bare key; "HIGH" in the panel said nothing. */
const SCHOOL_TYPE_LABEL = {
  high: 'High school',
  middle: 'Middle school',
  elementary: 'Elementary',
  k8: 'K–8',
  k12: 'K–12',
  pk8: 'PK–8',
  combined: 'Combined',
}

export function schoolSubtitle({ gradeLow, gradeHigh, schoolType, district, county } = {}) {
  const grade = (g) => (g === 'K' || g === 'PK3' || g === 'PK4' ? g : g ? `Grade ${g}` : null)
  if (gradeLow && gradeHigh) return gradeLow === gradeHigh ? grade(gradeLow) : `${gradeLow}–${gradeHigh}`
  if (schoolType) return SCHOOL_TYPE_LABEL[schoolType] ?? schoolType
  if (district) return district
  if (county) return `${county} County`
  return null
}

/**
 * @param {object}  props
 * @param {string}  props.name          School name — set over the mark.
 * @param {string} [props.logoBase64]   Full data URL, when the school uploaded one.
 * @param {string} [props.hue]          Identity colour; tints the ground.
 * @param {object} [props.school]       The school record, for the subtitle line.
 */
export default function SchoolCrest({ name, logoBase64 = null, hue = null, school = null }) {
  if (!name) return null
  const mark = monogramOf(name)
  const tint = hue ?? '#8b5cf6'
  const subtitle = schoolSubtitle(school ?? {})

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 hidden w-[28%] max-w-[360px] lg:block">
      {/* ── Ground ──
          A real logo is NOT used as the watermark. Most marks carry their own
          lettering, so blowing one up behind the school name printed two sets of
          type over each other and neither read. The logo instead appears crisp
          in the foreground below, and the ground here is just a soft blurred
          echo of it. The monogram has no such problem — it IS the name — so it
          still bleeds at watermark scale. */}
      <div className="absolute inset-0 overflow-hidden rounded-r-2xl">
        {logoBase64 ? (
          <img
            src={logoBase64}
            alt=""
            className="absolute left-1/2 top-1/2 h-[150%] w-[110%] -translate-x-1/2 -translate-y-1/2 object-contain opacity-[0.10]"
            style={{ filter: 'blur(18px) brightness(1.6)' }}
          />
        ) : (
          <span
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 select-none font-serif font-semibold leading-none"
            style={{
              fontSize: mark.length >= 3 ? '9.5rem' : mark.length === 2 ? '12rem' : '15rem',
              letterSpacing: '-0.04em',
              color: '#fff',
              opacity: 0.13,
            }}
          >
            {mark}
          </span>
        )}

        {/* A wash of the school's own colour, hottest at the outer edge. */}
        <span
          className="absolute inset-0"
          style={{ background: `radial-gradient(115% 100% at 60% 50%, ${tint}59 0%, transparent 72%)` }}
        />
        {/* The scrim RAMPS RIGHTWARD. The first cut ran dark-to-clear the other
            way, so the panel's darkest point was its left boundary — which
            printed a hard vertical seam against the bright aurora behind it,
            the exact edge a bleed is supposed to avoid. Transparent where it
            meets the band, deepening under the name that needs the contrast. */}
        <span
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(90deg, transparent 0%, rgba(15,17,24,0.16) 34%, rgba(15,17,24,0.40) 72%, rgba(15,17,24,0.46) 100%)',
          }}
        />
      </div>

      {/* ── The division line ── */}
      <span
        className="absolute inset-y-7 left-0 w-px"
        style={{ background: 'linear-gradient(180deg, transparent, rgba(255,255,255,0.22) 26%, rgba(255,255,255,0.22) 74%, transparent)' }}
      />

      {/* ── The name, set over the mark ── */}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2.5 px-6 text-center">
        {/* A LIGHT PLATE UNDER EVERY LOGO.
            School marks are overwhelmingly dark — navy, maroon, black line art
            — because they were drawn for white paper and white letterheads. Set
            straight onto this dark band, St Thomas Aquinas' crest and North
            Miami Beach's charger were all but invisible. The plate is what a
            real logo is designed to sit on, so it makes every school's mark
            legible without knowing anything about the mark. */}
        {logoBase64 ? (
          <span
            className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-2xl bg-white/95 p-1.5"
            style={{ boxShadow: '0 8px 22px rgba(0,0,0,0.30), inset 0 0 0 1px rgba(255,255,255,0.5)' }}
          >
            <img src={logoBase64} alt="" className="h-full w-full object-contain" />
          </span>
        ) : null}
        <span
          className="font-serif text-[17.5px] font-semibold leading-[1.15] tracking-[-0.01em] text-white"
          style={{ textShadow: '0 2px 14px rgba(0,0,0,0.45)' }}
        >
          {name}
        </span>
        {subtitle ? (
          <span className="mt-1.5 font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-white/55">
            {subtitle}
          </span>
        ) : null}
      </div>
    </div>
  )
}
