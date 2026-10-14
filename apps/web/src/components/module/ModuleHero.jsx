// ─────────────────────────────────────────────────────────────────────────────
// ModuleHero — the banner every module page opens with.
//
// PREMIUM UI P2 (docs/Premium_UI_Plan.md §2.7 sketch 6): the dark "command
// center" stage is allowed in exactly two places — the Home briefing band and
// the Studio hero. On a module page the hero is now the LIGHT page header: an
// eyebrow (MODULE · SCOPE), the title in EB Garamond, the meta line, any aside
// control on the hairline, a 2px rule in the module hue that draws once — and
// the stats as a Stat strip (vertical rules, count-ups), not glass chips.
//
// The PROPS ARE UNCHANGED so the module pages that render it need no edits:
//   module · hue · eyebrow · title · subtitle · stats [{ k, v }] · aside.
// `hue` is the module's hex; it becomes --c-module on the header so the rule,
// the arrow and any Stat marks inside read in the module's colour.
// ─────────────────────────────────────────────────────────────────────────────
import { useSchools } from '../../context/SchoolContext.jsx'
import { useScope } from '../../context/ScopeContext.jsx'
import { PageHeader, StatStrip, Stat } from '../ui/surface/index.js'
import { hueTriple } from '../ui/surface/Tile.jsx'

/**
 * @param {object}   props
 * @param {string}   props.module     Module key (kept for callers; the mark is retired).
 * @param {string}   props.hue        The module's locked hue (#RRGGBB).
 * @param {node}     props.eyebrow    Small caps line above the headline.
 * @param {string}   props.title      The headline. One sentence, no truncation.
 * @param {node}    [props.subtitle]  A line of context under it (the meta line).
 * @param {Array}   [props.stats]     [{ k, v }] — rendered as a Stat strip.
 * @param {node}    [props.aside]     Anything to hang on the hairline (a control).
 * @param {string}  [props.scope]     Override the SCOPE segment (null = none).
 */
export default function ModuleHero({ hue, eyebrow, title, subtitle, stats = [], aside = null, scope: scopeProp }) {
  const { activeSchool } = useSchools()
  const { scope, orgName, hasOrg } = useScope()
  // MODULE · SCOPE — the module eyebrow the caller passes, then where you are:
  // the active school, or the organization in org scope. A page whose scope is
  // not the active school (the network page) passes `scope` itself; null hides it.
  const autoScope = scope === 'org' && hasOrg ? orgName : activeSchool?.name
  const scopeLabel = scopeProp === undefined ? autoScope : scopeProp
  const eyebrowNode =
    eyebrow || scopeLabel ? (
      <span className="inline-flex flex-wrap items-center gap-1.5">
        {eyebrow ? <span className="inline-flex items-center gap-1.5">{eyebrow}</span> : null}
        {eyebrow && scopeLabel ? <span aria-hidden="true">·</span> : null}
        {scopeLabel ? <span className="normal-case tracking-normal">{scopeLabel}</span> : null}
      </span>
    ) : null

  return (
    <div className="module-hero" style={{ '--c-module': hueTriple(hue) }}>
      <PageHeader eyebrow={eyebrowNode} title={title} meta={subtitle} actions={aside} />
      {stats.length > 0 ? (
        <StatStrip cols={Math.min(stats.length, 6)} className="mt-0">
          {stats.map((s) => (
            <Stat key={s.k} label={s.k} value={s.v} />
          ))}
        </StatStrip>
      ) : null}
    </div>
  )
}
