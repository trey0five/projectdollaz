// ─────────────────────────────────────────────────────────────────────────────
// EvidenceReadinessTable — Phase C: the EVIDENCE tab.
//
// The question this screen answers is not "what have you got" — it is "what would
// a visiting team ask you for, does it exist, is it dated, and is it still
// current". So it is REQUIREMENT-driven and it is GROUPED BY TAG ACROSS STANDARDS:
// one annual audit serving nine standards is ONE row carrying nine
// `servesStandards` chips. That grouping is "enter data once" made visible, and it
// is the reason this is not just the standards register with an extra column.
//
// FOUR THINGS THIS COMPONENT WILL NOT DO:
//
//  1. It will not invent a currency. Every state, date, day-count and sentence
//     arrives computed from @finrep/compliance. There is no client-side date math
//     here at all — not a comparison, not a fallback, not a "probably still fine".
//  2. It will not hide an honest hole. `not_tracked` rows render in full, last,
//     with the server's wording ("tracked in your accreditor portal" for the
//     accreditor's own repository, "isn't tracked yet" for a register we have not
//     built) and a CTA that does not pretend to lead anywhere it cannot.
//  3. It will not let an auto-resolved artifact pass as something the school
//     typed. Every auto row carries the server's note — "Auto-linked from
//     Governance — you never entered this." — ON THE GROUP, visible without
//     expanding anything, because the demo moment and the honesty claim are the
//     same sentence.
//  4. It will not print a number without its denominator sentence. `health.basis`
//     is rendered beside the percentage, always, and the percentage is absent
//     (not zero) when nothing is rated. A school cannot reach a flattering figure
//     by dating nothing — it reaches no figure and one sentence.
//
// PREMIUM UI P4: `Section`s on the ground — the health figure and its four
// counts as a StatStrip, nudges as ruled rows with a 2px mark, the requirement
// groups as ruled rows (expand in place), flat Buttons. No cards.
// ─────────────────────────────────────────────────────────────────────────────
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import {
  ChevronDown,
  ChevronRight,
  FileStack,
  Info,
  Layers,
  Printer,
  Sparkles,
  TriangleAlert,
} from 'lucide-react'
import CurrencyChip from './CurrencyChip.jsx'
import { ctaIcon, whereItLives } from './evidenceMeta.js'
import { formatShortDate } from '../../lib/format.js'
import { Section, StatStrip, Stat, Button, Pill } from '../ui/surface/index.js'

// ── Small parts ──────────────────────────────────────────────────────────────

function Glyph(props) {
  const Icon = props.icon
  return <Icon size={props.size ?? 13} aria-hidden className={props.className} />
}

function Skeleton({ className = '' }) {
  return <div className={`rounded-lg bg-section motion-safe:animate-pulse ${className}`} aria-hidden />
}

// ── The health header ────────────────────────────────────────────────────────
// The percentage and its basis sentence are ONE unit and are never separated:
// `evidenceHealthPct` counts only artifacts we can actually judge, so the sentence
// that names what was excluded is the difference between a number and a claim.
function HealthHeader({ health, counts, framework, printHref }) {
  const pct = health && typeof health.evidenceHealthPct === 'number' ? health.evidenceHealthPct : null
  return (
    <Section
      label={
        <span className="inline-flex items-center gap-1.5">
          <Glyph icon={FileStack} size={12} />
          Proof readiness
          {framework?.name ? <span className="font-normal normal-case tracking-normal">· {framework.name}</span> : null}
        </span>
      }
      aside={
        printHref ? (
          <Button to={printHref} variant="secondary" size="sm" icon={<Glyph icon={Printer} size={13} />} className="no-print">
            Print proof list
          </Button>
        ) : null
      }
      className="!mt-0"
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        {pct == null ? (
          // NEVER 0-as-unknown. Nothing rated means no reading exists, and the
          // basis sentence below says exactly why.
          <span className="sec-title !mb-0">Not scored yet</span>
        ) : (
          <span className="font-serif text-display-xl font-medium leading-none text-ink tabular-nums">{pct}%</span>
        )}
        <span className="text-micro font-semibold uppercase text-ink2">current</span>
      </div>
      {/* THE ANTI-GAMING GUARD, rendered verbatim and never conditionally. */}
      {health?.basis ? <p className="mt-1.5 max-w-[70ch] text-small leading-relaxed text-ink2">{health.basis}</p> : null}

      {counts ? (
        <StatStrip cols={4} className="stats-wrap mt-4 grid-cols-2 sm:grid-cols-4">
          {/* ONE POPULATION, ONE DENOMINATOR. These two count ARTIFACTS — the same
              population `health.basis` counts below — so the strip can never print
              two different totals for one quantity. The per-standard row counts
              are the tooltip, not a second headline. */}
          <Stat
            label="Required artifacts"
            value={counts.artifacts ?? 0}
            title={`One artifact can answer many standards. ${counts.requirements ?? 0} standard-level asks collapse to these.`}
          />
          <Stat
            label="Tracked in KYRO"
            value={counts.artifactsTracked ?? 0}
            title="Artifacts whose owning register KYRO holds today. Everything else is excluded from every denominator."
          />
          <Stat label="Standards with a list" value={counts.standardsWithRequirements ?? 0} />
          <Stat
            label="Standards without one"
            value={counts.standardsLegacy ?? 0}
            title="These standards keep their existing evidence behaviour, unchanged."
          />
        </StatStrip>
      ) : null}
    </Section>
  )
}

// ── Nudges ───────────────────────────────────────────────────────────────────
function NudgeList({ nudges }) {
  if (!nudges?.length) return null
  return (
    <ul className="border-t border-hair">
      {nudges.map((n, i) => (
        <li key={`${n.kind}-${n.tag}-${i}`} className="flex items-start gap-2 border-b border-hair py-2 text-small leading-relaxed text-ink">
          <span className={`mark tone-${n.severity === 'warn' ? 'watch' : 'neutral'} mt-[5px]`} aria-hidden="true" />
          <Glyph icon={n.severity === 'warn' ? TriangleAlert : Info} size={14} className="mt-[2px] shrink-0 text-ink2" />
          <span className="min-w-0">
            {/* VERBATIM. */}
            {n.message}
            {n.link ? (
              <Link to={n.link} className="ml-1.5 font-semibold underline underline-offset-2">
                Open
              </Link>
            ) : null}
          </span>
        </li>
      ))}
    </ul>
  )
}

// ── The CTA pill ─────────────────────────────────────────────────────────────
// `cta.label` is the server's, always. A null `link` is not a broken button: it is
// a register that does not exist yet, so the pill does not navigate and carries
// the group's own message as its title. Phase C ships no fake links.
function CtaPill({ cta, title }) {
  if (!cta) return null
  const icon = ctaIcon(cta.kind)
  if (cta.link) {
    return (
      <Button to={cta.link} variant="secondary" size="sm" icon={<Glyph icon={icon} size={12} />}>
        {cta.label}
      </Button>
    )
  }
  return (
    <Button variant="quiet" size="sm" aria-disabled="true" title={title || undefined} icon={<Glyph icon={icon} size={12} />} className="cursor-default">
      {cta.label}
    </Button>
  )
}

// ── One artifact ─────────────────────────────────────────────────────────────
// The auto-linked note is the product claim in one line, so it is rendered on
// every auto row as well as on the group header: a school must never be able to
// mistake something we resolved for something they typed.
function ArtifactRow({ artifact }) {
  const auto = artifact.origin === 'auto'
  const dated = artifact.effectiveDate
    ? formatShortDate(String(artifact.effectiveDate).slice(0, 10))
    : null
  return (
    <li className="border-b border-hair py-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-1.5 text-small font-semibold text-ink">
            <span className="min-w-0 break-words">{artifact.label}</span>
            <Pill variant="status" tone={auto ? 'hue' : 'neutral'}>{auto ? 'Auto-linked' : 'Attached'}</Pill>
            {artifact.alsoInPortal === true ? <Pill>Also in your portal</Pill> : null}
          </p>
          {/* The artifact's OWN sentence, verbatim. */}
          {artifact.message ? <p className="mt-0.5 text-[12px] leading-relaxed text-ink2">{artifact.message}</p> : null}
          {/* The frozen auto-link note — "you never entered this". */}
          {auto && artifact.autoLinkedNote ? (
            <p className="mt-0.5 flex items-start gap-1.5 text-[12px] leading-relaxed text-ink2">
              <Glyph icon={Sparkles} size={12} className="mt-[3px] shrink-0" />
              <span>{artifact.autoLinkedNote}</span>
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <CurrencyChip
            state={artifact.state}
            expiresOn={artifact.expiresOn}
            showDate
            size="sm"
            title={artifact.message}
          />
          {/* The document's own date, never an upload date, never a guess. */}
          {dated ? <span className="text-[11px] text-ink2">covers {dated}</span> : null}
          {artifact.link ? (
            <Link to={artifact.link} className="dt-link text-[11.5px]">
              Open
            </Link>
          ) : null}
        </div>
      </div>
    </li>
  )
}

// ── One requirement group ────────────────────────────────────────────────────
function GroupCard({ group, onOpenStandard, reduce, nudgeLink = null }) {
  const [open, setOpen] = useState(false)
  const serves = group.servesStandards ?? []
  const artifacts = group.artifacts ?? []
  // The best artifact is first (the server sorted it), and it is the one carrying
  // the note that explains where the group's state came from.
  const autoNote = group.autoSatisfied ? artifacts.find((a) => a.autoLinkedNote)?.autoLinkedNote : null
  const notTracked = group.state === 'not_tracked'

  return (
    <motion.li layout={!reduce} className={`border-b border-hair py-3 ${notTracked ? 'opacity-80' : ''}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2">
            <CurrencyChip
              state={group.state}
              expiresOn={group.expiresOn}
              showDate
              title={group.message}
            />
            <span className="min-w-0 break-words text-body font-semibold text-ink">{group.label}</span>
          </p>
          {/* THE SENTENCE. Composed server-side, rendered verbatim, never edited. */}
          {group.message ? (
            <p className="mt-1 max-w-[80ch] text-small leading-relaxed text-ink2">{group.message}</p>
          ) : null}
          {/* Visible WITHOUT expanding: this came from another module. */}
          {autoNote ? (
            <p className="mt-1 flex items-start gap-1.5 text-small leading-relaxed text-ink2">
              <Glyph icon={Sparkles} size={13} className="mt-[3px] shrink-0" />
              <span>{autoNote}</span>
            </p>
          ) : null}
          {/* THE SERVER'S SUB-LINE, verbatim: the policy-aggregate sentence with
              its source counts, or the curriculum CONVENTION (§3.6). Composed in
              ONE place — the browser never re-words an honesty sentence, because
              two copies of one sentence are two sentences that can drift. */}
          {group.note ? (
            <p className="mt-1 max-w-[80ch] border-l-2 border-hair pl-2.5 text-[12px] leading-relaxed text-ink2">{group.note}</p>
          ) : null}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <CtaPill cta={group.cta} title={group.message} />
            {/* The link of the nudge folded into this group (the same sentence
                is said once — here), so no action is lost by the de-dupe. */}
            {nudgeLink && nudgeLink !== group.cta?.link ? (
              <Link to={nudgeLink} className="dt-link text-[12px]">
                Open
              </Link>
            ) : null}
            <span
              className="inline-flex items-center gap-1 text-[11.5px] text-ink2"
              title={`Where this lives: ${whereItLives(group.sourceRegister, group.dataAvailability)}`}
            >
              <Glyph icon={Layers} size={12} />
              {whereItLives(group.sourceRegister, group.dataAvailability)}
            </span>
          </div>
        </div>

        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="btn btn-quiet btn-sm shrink-0">
          {/* THE PAYOFF LINE: one audit, N standards. */}
          {serves.length} standard{serves.length === 1 ? '' : 's'}
          {open ? <ChevronDown size={13} aria-hidden /> : <ChevronRight size={13} aria-hidden />}
        </button>
      </div>

      {open ? (
        <div className="mt-3 space-y-3 border-t border-hair pt-3">
          <div>
            <p className="mb-1.5 text-micro font-semibold uppercase text-ink2">Serves</p>
            {serves.length === 0 ? (
              <p className="text-[12px] italic text-ink2">No standards in your register.</p>
            ) : (
              <ul className="flex flex-wrap gap-1.5">
                {serves.map((s) => (
                  <li key={s.standardId}>
                    {/* THE SAME RULE CtaPill APPLIES TWENTY LINES ABOVE: an
                        unhandled control is not a control. Without an
                        `onOpenStandard` this rendered a hover-highlighted <button>
                        whose click did nothing at all — live on the Accreditation
                        page (wired to `scrollToStandard`) and dead on the Mock
                        Visit, which passed no handler. A dead affordance in an
                        evidence table is worse than none: it invites verification
                        and verifies nothing. */}
                    {onOpenStandard ? (
                      <button
                        type="button"
                        onClick={() => onOpenStandard(s.standardId)}
                        title={s.title}
                        className="pill transition-colors hover:bg-ink/[.03]"
                      >
                        <span className="shrink-0">{s.code}</span>
                        <CurrencyChip state={s.state} size="sm" />
                      </button>
                    ) : (
                      <span
                        title={s.title}
                        className="pill cursor-default"
                      >
                        <span className="shrink-0">{s.code}</span>
                        <CurrencyChip state={s.state} size="sm" />
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <p className="mb-1.5 text-micro font-semibold uppercase text-ink2">Artifacts</p>
            {artifacts.length === 0 ? (
              <p className="text-[12px] italic text-ink2">Nothing on file for this requirement.</p>
            ) : (
              <ul className="border-t border-hair">
                {artifacts.map((a) => (
                  <ArtifactRow key={a.key} artifact={a} />
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </motion.li>
  )
}

// ═════════════════════════════════════════════════════════════════════════════

export default function EvidenceReadinessTable({
  health = null,
  counts = null,
  groups = [],
  nudges = [],
  framework = null,
  loading = false,
  error = '',
  notLicensed = false,
  printHref = null,
  onOpenStandard = null,
  /** Rendered above the requirement list — the strengths surface leads. */
  strengths = null,
}) {
  const reduce = useReducedMotion()

  if (loading && groups.length === 0) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-[128px]" />
        <Skeleton className="h-[74px]" />
        <Skeleton className="h-[74px]" />
        <Skeleton className="h-[74px]" />
      </div>
    )
  }

  // Never blanks the tab, never substitutes a zero — one honest line.
  if (notLicensed || (error && groups.length === 0)) {
    return (
      <p className="border-y border-hair px-6 py-12 text-center text-small text-ink2">Proof is unavailable right now.</p>
    )
  }

  // SAID ONCE. A nudge whose sentence is a group's own sentence ("No Approved
  // board minutes on file.") listed every missing item twice — once as a
  // nudge, once as its group below. Such a nudge folds into its group (its
  // link rides along); any nudge that is not a group's sentence still renders.
  const groupMessages = new Set(groups.map((g) => g?.message).filter(Boolean))
  const foldedLinks = new Map()
  const ownNudges = []
  for (const n of nudges ?? []) {
    if (n?.message && groupMessages.has(n.message)) {
      if (n.link && !foldedLinks.has(n.message)) foldedLinks.set(n.message, n.link)
    } else ownNudges.push(n)
  }

  return (
    <div>
      <HealthHeader health={health} counts={counts} framework={framework} printHref={printHref} />

      {strengths ? <div className="mt-6">{strengths}</div> : null}

      {ownNudges.length ? (
        <div className="mt-6">
          <NudgeList nudges={ownNudges} />
        </div>
      ) : null}

      {groups.length === 0 ? (
        <Section label="What they will ask for">
          <p className="border-y border-hair px-6 py-10 text-center text-small text-ink2">
            No required artifacts are defined for your framework. Your standards keep their existing evidence behaviour, unchanged.
          </p>
        </Section>
      ) : (
        <Section label="What they will ask for" aside="grouped by artifact, worst first">
          <ul className="border-t border-hair">
            {groups.map((g) => (
              <GroupCard
                key={g.tag}
                group={g}
                nudgeLink={foldedLinks.get(g.message) ?? null}
                onOpenStandard={onOpenStandard}
                reduce={reduce}
              />
            ))}
          </ul>
        </Section>
      )}
    </div>
  )
}
