// ─────────────────────────────────────────────────────────────────────────────
// evidenceMeta — the WEB-ONLY tokens for Phase C evidence currency.
//
// WHAT IS NOT HERE, DELIBERATELY: every sentence the user reads. The per-group
// `message`, the not-tracked wording ("tracked in your accreditor portal" /
// "isn't tracked yet"), the auto-link note ("Auto-linked from Governance — you
// never entered this."), the CTA label, `health.basis` and the commendation
// narrative are ALL composed by @finrep/compliance and rendered verbatim. The web
// composes no honesty copy, because two copies of an honesty sentence is two
// sentences that can drift, and the drifting one is always the flattering one.
//
// What this file owns is presentation the server has no business owning: a colour,
// a glyph, a print-safe label vocabulary, and the one CONVENTION note §3.6 of the
// build spec explicitly assigns to the web.
//
// TWO MIRRORS, AND WHY THEY ARE MIRRORS AND NOT IMPORTS: apps/web does not depend
// on @finrep/compliance (it depends on @finrep/analytics, @finrep/engine and
// @finrep/ingestion only), so CURRENCY_LABEL and REGISTER_DOMAIN_LABEL are
// re-declared here — byte-for-byte, same source-of-truth comment as
// recordFlows.jsx's STANDARD_RATINGS mirror. They are LABEL VOCABULARIES, not
// claims: neither can assert a state, a date or a currency. Any state or register
// this build does not know about degrades to a neutral chip and the raw key,
// never to a wrong word and never to a crash.
// ─────────────────────────────────────────────────────────────────────────────
import {
  AlertTriangle,
  CalendarClock,
  CalendarPlus,
  CircleDashed,
  CircleHelp,
  CircleSlash,
  Clock,
  ExternalLink,
  RefreshCw,
  ShieldCheck,
  Upload,
} from 'lucide-react'

export const AMBER = '#F59E0B'
/** Accessible amber for large numerals / bold text on a light surface. */
export const AMBER_INK = '#B45309'

// ── The six currency states ──────────────────────────────────────────────────
// MIRROR of @finrep/compliance CURRENCY_LABEL (evidence-currency.ts). Labels only.
export const CURRENCY_LABEL = {
  current: 'Current',
  expiring: 'Expiring',
  stale: 'Out of date',
  missing: 'Missing',
  unknown: 'Date unknown',
  not_tracked: 'Not tracked',
}

/**
 * Light-surface chip vocabulary, one row per state.
 *
 * `unknown` is deliberately NEUTRAL, not amber and not red. An undated artifact is
 * not a failure — it is a question we refuse to answer by guessing, it is excluded
 * from every denominator, and colouring it like a risk would be the UI asserting
 * exactly the thing the engine declines to assert.
 *
 * `not_tracked` is greyer still: it is a hole we chose not to dig, the school is
 * never scored down for it, and it must never read as a red mark against them.
 */
export const CURRENCY_META = {
  current: {
    label: CURRENCY_LABEL.current,
    icon: ShieldCheck,
    chip: 'border-emerald-300/70 bg-emerald-50 text-emerald-700',
    dot: '#10b981',
  },
  expiring: {
    label: CURRENCY_LABEL.expiring,
    icon: Clock,
    chip: 'border-[#F59E0B]/45 bg-amber-50 text-amber-700',
    dot: '#F59E0B',
  },
  stale: {
    label: CURRENCY_LABEL.stale,
    icon: AlertTriangle,
    chip: 'border-danger/35 bg-danger/10 text-danger',
    dot: '#dc2626',
  },
  missing: {
    label: CURRENCY_LABEL.missing,
    icon: CircleSlash,
    chip: 'border-danger/30 bg-danger/[0.07] text-danger',
    dot: '#dc2626',
  },
  unknown: {
    label: CURRENCY_LABEL.unknown,
    icon: CircleHelp,
    chip: 'border-navy/20 bg-navy/[0.06] text-navy',
    dot: '#64748b',
  },
  not_tracked: {
    label: CURRENCY_LABEL.not_tracked,
    icon: CircleDashed,
    chip: 'border-rule/70 bg-section text-muted',
    dot: '#94a3b8',
  },
}

const NEUTRAL_META = {
  label: null,
  icon: CircleHelp,
  chip: 'border-rule/70 bg-section text-muted',
  dot: '#94a3b8',
}

/** Presentation tokens for a state (never throws; unknown key → neutral + the raw
 *  key as its label, so a server that ships a seventh state degrades legibly). */
export function currencyMeta(state) {
  const meta = CURRENCY_META[state]
  if (meta) return meta
  return { ...NEUTRAL_META, label: typeof state === 'string' ? state : '—' }
}

/** The state label alone — used by the print page, where a chip is noise. */
export function currencyLabel(state) {
  return CURRENCY_LABEL[state] ?? (typeof state === 'string' ? state : '—')
}

/**
 * Worst-first, matching @finrep/compliance CURRENCY_RANK exactly. Used ONLY for
 * presentation ordering inside a list the server already sorted (and to pick the
 * loudest of several per-standard states on the register row) — never to decide a
 * state, which is the engine's job alone.
 *
 * Note `unknown` outranks `stale` here just as it does in the engine: one out-of-
 * date audit plus one undated audit is not an out-of-date requirement — we know
 * one is expired and we cannot judge the other, and the honest reading is the
 * weaker claim, not the worse one.
 */
export const CURRENCY_RANK = {
  current: 0,
  expiring: 1,
  unknown: 2,
  stale: 3,
  missing: 4,
  not_tracked: 5,
}

export function currencyRank(state) {
  return CURRENCY_RANK[state] ?? 99
}

// ── Where an artifact lives ──────────────────────────────────────────────────
// MIRROR of @finrep/compliance REGISTER_DOMAIN_LABEL (evidence-currency.ts). The
// "Where it lives" column of the Evidence Index, and the module name inside the
// auto-link note the server already composed.
export const REGISTER_DOMAIN_LABEL = {
  policy: 'Governance',
  meeting: 'Governance',
  strategic_plan: 'Strategy',
  period_budget: 'Budget',
  enrollment_snapshot: 'Enrollment',
  knowledge_document: 'your document store',
  board_report: 'Reports',
  maintenance_item: 'Facilities',
  staff_evaluation_register: 'HR',
  professional_development: 'HR',
  clearance_register: 'HR',
  lms: 'your assessment system',
  portal: 'your accreditor portal',
}

/** In-app route for the register that owns an artifact, or null when there is
 *  nothing to open (a system KYRO is not connected to, or a register we have not
 *  built yet — Phase C ships NO fake links). */
export const REGISTER_ROUTE = {
  policy: '/governance',
  meeting: '/governance',
  strategic_plan: '/strategy',
  period_budget: '/budget',
  enrollment_snapshot: '/enrollment',
  knowledge_document: '/knowledge',
  board_report: '/reports',
  maintenance_item: null,
  staff_evaluation_register: null,
  professional_development: null,
  clearance_register: null,
  lms: null,
  portal: null,
}

/**
 * "Where it lives", for the print page and the group card.
 *
 * A non-`platform` requirement NEVER names an in-app home, even when the forward-
 * declared register has a friendly name: KYRO does not hold it, and printing
 * "HR" beside a row we cannot see would tell a visiting team we have something we
 * do not. `dataAvailability` is checked first, always.
 */
export function whereItLives(sourceRegister, dataAvailability) {
  if (dataAvailability && dataAvailability !== 'platform') return 'Not tracked in KYRO'
  return REGISTER_DOMAIN_LABEL[sourceRegister] ?? '—'
}

// ── CTA presentation ─────────────────────────────────────────────────────────
// The LABEL is always the server's (`cta.label`, rendered verbatim). This map
// carries only the glyph and whether the pill navigates. A CTA with `link: null`
// is NOT a broken button — it is the honest state of a register that does not
// exist yet, so it renders as a non-navigating pill whose title is the group's own
// message. Phase F flips those rows to `platform` and the CTA disappears entirely.
export const CTA_ICON = {
  start_tracking: ExternalLink,
  add_date: CalendarPlus,
  upload: Upload,
  review: RefreshCw,
}

export function ctaIcon(kind) {
  return CTA_ICON[kind] ?? CalendarClock
}

// ── The one sentence §3.6 assigns to the web — DOCUMENTATION ONLY ────────────
/**
 * CURRICULUM REVIEW IS A DOCUMENTED CONVENTION, NOT A FEATURE (honesty-ledger row
 * 23). There is no curriculum model and no curriculum code anywhere in this phase.
 * The requirement resolves against a Governance `Policy` whose category contains
 * "curric", and the policy register's own review cycle does the rest for free.
 *
 * NOT A RENDER SOURCE. The sentence a school actually reads arrives as the
 * group's server-composed `note` (evidence-readiness.service.ts `noteFor`), and
 * the card renders THAT, verbatim. This copy is kept beside the rest of the
 * evidence vocabulary purely so the convention is legible from the web side; if
 * the wording ever changes, it changes on the server and this constant follows.
 */
export const CURRICULUM_CONVENTION_NOTE =
  'Add a policy in Governance with the category "Curriculum" and a review interval. ' +
  "We can't see your curriculum — we can track when you last reviewed its documentation."

// ── Nudge severity ───────────────────────────────────────────────────────────
export const NUDGE_TONE = {
  warn: 'border-danger/30 bg-danger/[0.06] text-danger',
  info: 'border-navy/15 bg-navy/[0.04] text-navy',
}

export function nudgeTone(severity) {
  return NUDGE_TONE[severity] ?? NUDGE_TONE.info
}

// ── The mandatory print footer ───────────────────────────────────────────────
/**
 * Printed on the Evidence Index, always, regardless of payload state. This is the
 * line that keeps a KYRO self-assessment from being mistaken for an accreditation
 * product — it is not decoration and it is not `no-print`.
 */
export const EVIDENCE_INDEX_DISCLAIMER =
  'Self-assessment produced by KYRO from school-entered and integrated data. ' +
  'Not an accreditation product; not affiliated with, endorsed by, or a submission to ' +
  "Cognia / MSA / WCEA. The accreditor's portal remains the authoritative repository."

/** The one field we ask for, worded once and reused by every surface that asks. */
export const EFFECTIVE_DATE_LABEL = 'Which period does this cover?'
export const EFFECTIVE_DATE_HELP =
  'We use this to tell you when it goes stale. Not sure? Leave it blank — we’ll say ' +
  '“date unknown” rather than guess.'
