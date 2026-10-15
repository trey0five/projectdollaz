// ─────────────────────────────────────────────────────────────────────────────
// AuroraSection — the "fancy professional divider": a heading strip with a
// round gradient medallion, a serif title, ONE short subtitle, an optional
// count pill on the right, three diamond ornaments and a coloured rule — then
// the section body.
//
// Props
//   icon       lucide component for the medallion
//   title      plain words ("Warnings", "This year's numbers", "Records")
//   subtitle   one short line (≤ 8 words is the target)
//   count      short text for the right-hand pill ("2 at risk · 1 watch")
//   aside      extra node on the right (a "+ New" button, a switch)
//   tone       risk | watch | good — status-coloured strip (Warnings!)
//   hue, hue2  hex overrides; default = the module hue + its companion
//   compact    smaller strip for a narrow column (a rail beside a register)
//   first      tighter top margin (the first section under the band)
//   id         kept on the <section> (guide anchors, deep links)
// ─────────────────────────────────────────────────────────────────────────────
const TONE_HUES = {
  risk: ['#e11d48', '#f97316'],
  watch: ['#d97706', '#f59e0b'],
  good: ['#059669', '#10b981'],
}

export default function AuroraSection({
  icon: Icon = null,
  title,
  subtitle = null,
  count = null,
  aside = null,
  tone = null,
  hue = null,
  hue2 = null,
  compact = false,
  first = false,
  headingLevel = 2,
  className = '',
  style,
  children,
  ...rest
}) {
  const pair = TONE_HUES[tone] ?? null
  const h = hue ?? pair?.[0] ?? null
  const h2 = hue2 ?? pair?.[1] ?? (hue ? hue : null)
  const vars = {
    ...(h ? { '--sh': h } : null),
    ...(h2 ? { '--sh2': h2 } : null),
    ...style,
  }
  const H = `h${headingLevel}`
  const cls = ['au-sec', compact ? 'au-sec-compact' : null, first ? 'au-sec-first' : null, className || null]
    .filter(Boolean)
    .join(' ')
  return (
    <section className={cls} style={vars} {...rest}>
      <div className="au-ribbon">
        <span className="au-medal" aria-hidden="true">
          {Icon ? <Icon size={compact ? 20 : 25} /> : null}
        </span>
        <div className="au-ribbon-text">
          <H className="au-ribbon-title">{title}</H>
          {subtitle ? <p className="au-ribbon-sub">{subtitle}</p> : null}
          {/* In a narrow column the count rides under the words, not beside them. */}
          {compact && count != null && count !== '' ? <span className="au-count">{count}</span> : null}
        </div>
        {(!compact && count != null) || aside || !compact ? (
          <div className="au-ribbon-rr">
            {!compact && count != null && count !== '' ? <span className="au-count">{count}</span> : null}
            {aside}
            <span className="au-orn" aria-hidden="true">
              <b />
              <b />
              <b />
            </span>
          </div>
        ) : null}
      </div>
      {children}
    </section>
  )
}
