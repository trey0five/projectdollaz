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
// Light surface, amber accent, inside the command center's register card.
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
import { AMBER_INK, ctaIcon, nudgeTone, whereItLives } from './evidenceMeta.js'
import { formatShortDate } from '../../lib/format.js'

// ── Small parts ──────────────────────────────────────────────────────────────

function Glyph(props) {
  const Icon = props.icon
  return <Icon size={props.size ?? 13} aria-hidden className={props.className} />
}

function Stat({ label, value, sub, title }) {
  return (
    <div className="rounded-xl border border-rule/60 bg-white px-3 py-2" title={title || undefined}>
      <p className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted">{label}</p>
      <p className="mt-0.5 font-serif text-[19px] font-semibold leading-none text-navy">{value}</p>
      {sub ? <p className="mt-1 text-[11.5px] leading-snug text-muted">{sub}</p> : null}
    </div>
  )
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
    <div className="rounded-2xl border border-[#F59E0B]/25 bg-[#F59E0B]/[0.05] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
            <Glyph icon={FileStack} size={12} />
            Evidence readiness
            {framework?.name ? (
              <span className="font-normal normal-case tracking-normal text-muted/80">
                · {framework.name}
              </span>
            ) : null}
          </p>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            {pct == null ? (
              // NEVER 0-as-unknown. Nothing rated means no reading exists, and the
              // basis sentence below says exactly why.
              <span className="font-serif text-[22px] font-semibold leading-none text-navy">
                Not scored yet
              </span>
            ) : (
              <span
                className="font-serif text-[34px] font-semibold leading-none"
                style={{ color: AMBER_INK }}
              >
                {pct}%
              </span>
            )}
            <span className="text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">
              current
            </span>
          </div>
          {/* THE ANTI-GAMING GUARD, rendered verbatim and never conditionally. */}
          {health?.basis ? (
            <p className="mt-1.5 max-w-[70ch] text-[12.5px] leading-relaxed text-muted">
              {health.basis}
            </p>
          ) : null}
        </div>

        {printHref ? (
          <Link
            to={printHref}
            className="no-print inline-flex shrink-0 items-center gap-1.5 rounded-full border border-rule/70 bg-white px-3.5 py-1.5 text-[13px] font-semibold text-navy transition hover:border-[#F59E0B]/60"
          >
            <Glyph icon={Printer} size={14} className="text-[#F59E0B]" />
            Evidence Index
          </Link>
        ) : null}
      </div>

      {counts ? (
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {/* ONE POPULATION, ONE DENOMINATOR. These two count ARTIFACTS — the same
              population `health.basis` counts below — so the card can never print
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
        </div>
      ) : null}
    </div>
  )
}

// ── Nudges ───────────────────────────────────────────────────────────────────
function NudgeList({ nudges }) {
  if (!nudges?.length) return null
  return (
    <ul className="space-y-1.5">
      {nudges.map((n, i) => (
        <li
          key={`${n.kind}-${n.tag}-${i}`}
          className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-[12.5px] leading-relaxed ${nudgeTone(
            n.severity,
          )}`}
        >
          <Glyph icon={n.severity === 'warn' ? TriangleAlert : Info} size={14} className="mt-[2px] shrink-0" />
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
  const base =
    'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-semibold transition'
  if (cta.link) {
    return (
      <Link
        to={cta.link}
        className={`${base} border-[#F59E0B]/45 bg-[#F59E0B]/10 text-[#8a5a06] hover:bg-[#F59E0B]/20`}
      >
        <Glyph icon={icon} size={12} />
        {cta.label}
      </Link>
    )
  }
  return (
    <span
      title={title || undefined}
      className={`${base} cursor-default border-rule/70 bg-section text-muted`}
    >
      <Glyph icon={icon} size={12} />
      {cta.label}
    </span>
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
    <li className="rounded-lg border border-rule/60 bg-white px-3 py-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-1.5 text-[13px] font-semibold text-navy">
            <span className="min-w-0 break-words">{artifact.label}</span>
            <span
              className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.06em] ${
                auto
                  ? 'border-[#F59E0B]/45 bg-[#F59E0B]/10 text-[#8a5a06]'
                  : 'border-navy/20 bg-navy/[0.05] text-navy'
              }`}
            >
              {auto ? 'Auto-linked' : 'Attached'}
            </span>
            {artifact.alsoInPortal === true ? (
              <span className="shrink-0 rounded-md border border-rule/70 bg-section px-1.5 py-0.5 text-[10.5px] font-semibold text-muted">
                Also in your portal
              </span>
            ) : null}
          </p>
          {/* The artifact's OWN sentence, verbatim. */}
          {artifact.message ? (
            <p className="mt-0.5 text-[12px] leading-relaxed text-muted">{artifact.message}</p>
          ) : null}
          {/* The frozen auto-link note — "you never entered this". */}
          {auto && artifact.autoLinkedNote ? (
            <p className="mt-0.5 flex items-start gap-1.5 text-[12px] leading-relaxed text-[#8a5a06]">
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
          {dated ? (
            <span className="text-[11px] text-muted">covers {dated}</span>
          ) : null}
          {artifact.link ? (
            <Link
              to={artifact.link}
              className="text-[11.5px] font-semibold text-[#8a5a06] underline underline-offset-2"
            >
              Open
            </Link>
          ) : null}
        </div>
      </div>
    </li>
  )
}

// ── One requirement group ────────────────────────────────────────────────────
function GroupCard({ group, onOpenStandard, reduce }) {
  const [open, setOpen] = useState(false)
  const serves = group.servesStandards ?? []
  const artifacts = group.artifacts ?? []
  // The best artifact is first (the server sorted it), and it is the one carrying
  // the note that explains where the group's state came from.
  const autoNote = group.autoSatisfied ? artifacts.find((a) => a.autoLinkedNote)?.autoLinkedNote : null
  const notTracked = group.state === 'not_tracked'

  return (
    <motion.li
      layout={!reduce}
      className={`rounded-xl border px-3.5 py-3 ${
        notTracked ? 'border-rule/60 bg-section/60' : 'border-rule/70 bg-white'
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2">
            <CurrencyChip
              state={group.state}
              expiresOn={group.expiresOn}
              showDate
              title={group.message}
            />
            <span className="min-w-0 break-words text-[14px] font-semibold text-navy">
              {group.label}
            </span>
          </p>
          {/* THE SENTENCE. Composed server-side, rendered verbatim, never edited. */}
          {group.message ? (
            <p className="mt-1 max-w-[80ch] text-[12.5px] leading-relaxed text-muted">
              {group.message}
            </p>
          ) : null}
          {/* Visible WITHOUT expanding: this came from another module. */}
          {autoNote ? (
            <p className="mt-1 flex items-start gap-1.5 text-[12.5px] leading-relaxed text-[#8a5a06]">
              <Glyph icon={Sparkles} size={13} className="mt-[3px] shrink-0" />
              <span>{autoNote}</span>
            </p>
          ) : null}
          {/* THE SERVER'S SUB-LINE, verbatim: the policy-aggregate sentence with
              its source counts, or the curriculum CONVENTION (§3.6). Composed in
              ONE place — the browser never re-words an honesty sentence, because
              two copies of one sentence are two sentences that can drift. */}
          {group.note ? (
            <p className="mt-1 max-w-[80ch] rounded-lg border border-rule/60 bg-section px-2.5 py-1.5 text-[12px] leading-relaxed text-muted">
              {group.note}
            </p>
          ) : null}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <CtaPill cta={group.cta} title={group.message} />
            <span
              className="inline-flex items-center gap-1 text-[11.5px] text-muted"
              title={`Where this lives: ${whereItLives(group.sourceRegister, group.dataAvailability)}`}
            >
              <Glyph icon={Layers} size={12} />
              {whereItLives(group.sourceRegister, group.dataAvailability)}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-rule/60 px-2 py-1 text-[11.5px] font-semibold text-muted transition hover:border-[#F59E0B]/60 hover:text-navy"
        >
          {/* THE PAYOFF LINE: one audit, N standards. */}
          {serves.length} standard{serves.length === 1 ? '' : 's'}
          {open ? <ChevronDown size={13} aria-hidden /> : <ChevronRight size={13} aria-hidden />}
        </button>
      </div>

      {open ? (
        <div className="mt-3 space-y-3 border-t border-rule/50 pt-3">
          <div>
            <p className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted">
              Serves
            </p>
            {serves.length === 0 ? (
              <p className="text-[12px] italic text-muted">No standards in your register.</p>
            ) : (
              <ul className="flex flex-wrap gap-1.5">
                {serves.map((s) => (
                  <li key={s.standardId}>
                    <button
                      type="button"
                      onClick={() => onOpenStandard?.(s.standardId)}
                      title={s.title}
                      className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-rule/60 bg-white px-2 py-1 text-[11.5px] font-semibold text-navy transition hover:border-[#F59E0B]/60"
                    >
                      <span className="shrink-0">{s.code}</span>
                      <CurrencyChip state={s.state} size="sm" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <p className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted">
              Artifacts
            </p>
            {artifacts.length === 0 ? (
              <p className="text-[12px] italic text-muted">
                Nothing on file for this requirement.
              </p>
            ) : (
              <ul className="space-y-1.5">
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
      <div className="rounded-xl border border-dashed border-rule/60 bg-cream/50 px-6 py-12 text-center">
        <p className="text-[14px] text-muted">Evidence readiness is unavailable right now.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <HealthHeader health={health} counts={counts} framework={framework} printHref={printHref} />

      {strengths}

      <NudgeList nudges={nudges} />

      {groups.length === 0 ? (
        <div className="rounded-xl border border-dashed border-rule/60 bg-cream/50 px-6 py-10 text-center">
          <p className="font-serif text-[16px] italic text-muted">
            No required artifacts are defined for your framework.
          </p>
          <p className="mx-auto mt-1 max-w-[60ch] text-[12.5px] leading-relaxed text-muted">
            Your standards keep their existing evidence behaviour, unchanged.
          </p>
        </div>
      ) : (
        <div>
          <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
            <Glyph icon={FileStack} size={12} className="text-[#F59E0B]" />
            What they will ask for
            <span className="font-normal normal-case tracking-normal text-muted/80">
              · grouped by artifact, worst first
            </span>
          </p>
          <ul className="space-y-2">
            {groups.map((g) => (
              <GroupCard
                key={g.tag}
                group={g}
                onOpenStandard={onOpenStandard}
                reduce={reduce}
              />
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
