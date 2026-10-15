// ─────────────────────────────────────────────────────────────────────────────
// AuroraHero — the tall rounded aurora BAND every module page opens with.
//
//   ┌──────────────────────────────────────────────────────────────────────┐
//   │ [school chip]  EYEBROW (period)                    ░monogram░        │
//   │ Title (serif, big)                                 [aside: switch]   │
//   │ One plain verdict sentence.                                          │
//   │ [Primary]  [Ghost]  [Ghost]                                          │
//   │ [glass KPI] [glass KPI] [glass KPI] [glass KPI]                      │
//   │ {children — rare: something that must live on the band}             │
//   └──────────────────────────────────────────────────────────────────────┘
//
// Props
//   moduleKey | hue   the band's hue (module key → the locked registry hue, or
//                     a hex). Omit both inside a module page root: the --au-*
//                     vars from moduleAccentVars are inherited.
//   school            school name → the glass chip (null/'' hides it)
//   eyebrow           the period / context line beside the chip
//   title             module name EXACTLY as the sidebar has it
//   verdict           ONE sentence (node). Use <VerdictEm> for the key words.
//   actions           1 primary + up to 2 ghost buttons (AuroraButton, or the
//                     existing surface Buttons/CTAs — restyled on the band)
//   tools             secondary controls (a framework switcher, a division
//                     select, an "as of" chip, a Refresh button) — a compact
//                     glass row under the buttons that wraps and never overlaps;
//                     on a phone a label+select gets its own full-width line
//   aside             right column (period switcher etc.)
//   monogram          big faint letters behind the aside; default = school
//                     initials; false hides it
//   kpis              array of AuroraKpi props (or a node). The first 4 are
//                     glass cards; any more become a compact "more figures" row
//                     of small glass chips (label · value · verdict) so the band
//                     stays short. Each item may carry a React `key`.
//   kpiCols           force the glass grid's column count at ≥1280px
//   children          rendered last, inside the band
// Screen only; reduced motion → static band (`au-still`).
// ─────────────────────────────────────────────────────────────────────────────
import { useReducedMotion } from 'framer-motion'
import { Building2 } from 'lucide-react'
import { auroraVarsFromHue, moduleAuroraVars } from '../../module/moduleAnatomy.js'
import AuroraKpi, { AuroraKpiGrid, AuroraKpiChips, KPI_CARD_MAX } from './AuroraKpi.jsx'

/** "Sample 01 High School" → "S0"; "All Souls Catholic School" → "AS". */
export function initialsOf(name) {
  const words = String(name ?? '')
    .split(/\s+/)
    .filter(Boolean)
  return words
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
}

export default function AuroraHero({
  moduleKey = null,
  hue = null,
  school = null,
  eyebrow = null,
  title,
  verdict = null,
  actions = null,
  tools = null,
  aside = null,
  monogram = undefined,
  kpis = null,
  kpiCols = null,
  className = '',
  style,
  children,
  ...rest
}) {
  const reduce = useReducedMotion()
  const vars = hue ? auroraVarsFromHue(hue) : moduleKey ? moduleAuroraVars(moduleKey) : null
  const mono = monogram === false ? '' : (monogram ?? initialsOf(school))
  // `key` is React's, not a prop: pull it out BEFORE spreading (React 19 logs
  // an error for a spread object that carries `key`).
  const kpiNode = Array.isArray(kpis) ? (
    kpis.length ? (
      <>
        <AuroraKpiGrid cols={kpiCols}>
          {kpis.slice(0, KPI_CARD_MAX).map(({ key, ...k }, i) => (
            <AuroraKpi key={key ?? k.label ?? i} {...k} />
          ))}
        </AuroraKpiGrid>
        <AuroraKpiChips items={kpis.slice(KPI_CARD_MAX)} />
      </>
    ) : null
  ) : (
    kpis
  )
  const cls = ['au-hero', reduce ? 'au-still' : null, className || null].filter(Boolean).join(' ')

  return (
    <section className={cls} style={vars ? { ...vars, ...style } : style} data-motion={reduce ? 'static' : 'drift'} {...rest}>
      <span className="au-fx" aria-hidden="true">
        <span className="au-blob au-blob-1" />
        <span className="au-blob au-blob-2" />
        <span className="au-blob au-blob-3" />
        <span className="au-veil" />
        <span className="au-grain" />
        <svg className="au-ribbonart" viewBox="0 0 1100 460" preserveAspectRatio="none">
          <g fill="none" strokeWidth="1.2">
            <path d="M0 360 C200 300 360 420 560 340 S900 220 1100 280" stroke="rgba(255,255,255,.22)" />
            <path d="M0 380 C220 320 380 440 580 360 S920 240 1100 300" stroke="rgba(255,255,255,.12)" />
            <path d="M0 400 C240 340 400 460 600 380 S940 260 1100 320" stroke="rgba(255,255,255,.07)" />
          </g>
        </svg>
      </span>

      <div className="au-hero-top">
        <div className="au-hero-main">
          {school || eyebrow ? (
            <p className="au-eyebrow">
              {school ? (
                <span className="au-chip">
                  <Building2 size={13} aria-hidden="true" />
                  {school}
                </span>
              ) : null}
              {eyebrow ? <span>{eyebrow}</span> : null}
            </p>
          ) : null}
          <h1 className="au-title">{title}</h1>
          {verdict ? <p className="au-verdict">{verdict}</p> : null}
          {actions ? <div className="au-actions">{actions}</div> : null}
          {tools ? <div className="au-actions au-tools">{tools}</div> : null}
        </div>
        {aside || mono ? (
          <div className="au-aside">
            {mono ? (
              <span className="au-monogram" aria-hidden="true">
                {mono}
              </span>
            ) : null}
            {aside ? <div className="au-aside-body">{aside}</div> : null}
          </div>
        ) : null}
      </div>

      {kpiNode}
      {children}
    </section>
  )
}
