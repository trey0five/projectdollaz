// ─────────────────────────────────────────────────────────────────────────────
// improvementMeta — the WEB-side display vocabulary for the Continuous
// Improvement Manager (AIC Phase G). Pure data + pure helpers: no React, no
// api.js, no hooks — so the honesty specs can import it without a DOM.
//
// WHY THE HUE LIVES HERE AND NOT IN moduleAnatomy.js: /improvement deliberately
// has NO module key (there is no third SKU — the page rides on `accreditation`
// OR `strategy`), and moduleAnatomy/MODULE_ANATOMY is a ZERO-DIFF file for this
// phase: adding an `improvement` entry there would mint a tab-rail whose label
// resolves through MODULE_META and renders `undefined`. So the page carries its
// own hue and its own accent vars, mirroring moduleAccentVars' var names exactly
// so every shared surface (RecordFlow, the CTA gradients, focus rings) themes
// itself the same way it does on a real module page.
//
// NOTHING HERE INVENTS A VALUE. Every label maps a server-sent token to English;
// every formatter returns null when the server sent null, so a missing number can
// never be rendered as a zero.
// ─────────────────────────────────────────────────────────────────────────────

/** The Improvement hue — teal, distinct from all nine locked home-tile hues. */
export const IMPROVEMENT_HUE = '#14B8A6'

// ── Accent vars (same names as moduleAccentVars, computed from IMPROVEMENT_HUE) ─
const hexRgb = (hex) => {
  const h = hex.replace('#', '')
  const f = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  return [parseInt(f.slice(0, 2), 16), parseInt(f.slice(2, 4), 16), parseInt(f.slice(4, 6), 16)]
}
const mixRgb = (rgb, target, t) => rgb.map((c, i) => Math.round(c + (target[i] - c) * t))
const rgbHex = (rgb) => `#${rgb.map((c) => c.toString(16).padStart(2, '0')).join('')}`
const WHITE = [255, 255, 255]
const BLACK = [0, 0, 0]

/** Inline-style accent-var overrides for the /improvement page root. */
export function improvementAccentVars() {
  const rgb = hexRgb(IMPROVEMENT_HUE)
  const triplet = (v) => v.join(' ')
  return {
    '--c-module': triplet(rgb),
    '--c-gold': triplet(rgb),
    '--c-gold-light': triplet(mixRgb(rgb, WHITE, 0.35)),
    '--c-gold-pale': triplet(mixRgb(rgb, WHITE, 0.82)),
    '--c-glow': triplet(rgb),
    '--grad-cta-0': rgbHex(mixRgb(rgb, WHITE, 0.45)),
    '--grad-cta-1': rgbHex(rgb),
    '--grad-cta-2': rgbHex(mixRgb(rgb, BLACK, 0.18)),
  }
}

/** Translucent hue for borders/washes. */
export function hueAlpha(alpha) {
  const [r, g, b] = hexRgb(IMPROVEMENT_HUE)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

// ── Vocabulary (server tokens → English) ─────────────────────────────────────
// apps/api/src/strategy/strategy.constants.ts INITIATIVE_STATUSES
export const STATUS_LABELS = {
  planned: 'Planned',
  in_progress: 'In progress',
  blocked: 'Blocked',
  done: 'Done',
  cancelled: 'Cancelled',
}
export const STATUS_ORDER = ['in_progress', 'blocked', 'planned', 'done', 'cancelled']

/** CreateImprovementInitiativeDto originType (@IsIn) — the spec's five values. */
export const ORIGIN_LABELS = {
  manual: 'Added by hand',
  gap: 'From a readiness gap',
  assurance: 'From an assurance gate',
  finding: 'From an early warning',
  draft: 'Draft',
}

/** progressSource (@IsIn) — null is NOT a value here; null reads "Status only". */
export const PROGRESS_SOURCE_LABELS = {
  metric: 'Measured against a KPI',
  milestone: 'Milestones completed',
  task_rollup: 'Linked tasks completed',
  manual: 'Hand-set percentage',
}

/**
 * riskSignal is COMPUTED by the server (overdue → behind → at_risk → watch →
 * none). It is never merged with riskLevel, which a human sets. Two fields, two
 * chips, two labels — see the drawer and its honesty spec.
 */
export const RISK_SIGNAL_META = {
  overdue: { label: 'Overdue', tone: 'bad' },
  behind: { label: 'Behind pace', tone: 'bad' },
  at_risk: { label: 'At risk', tone: 'warn' },
  watch: { label: 'Watch', tone: 'warn' },
  none: { label: 'No signal', tone: 'good' },
}

/** riskLevel is the HUMAN column. Null means nobody set one — NOT "none". */
export const RISK_LEVEL_LABELS = { low: 'Low', medium: 'Medium', high: 'High' }

export const PACE_LABELS = {
  on_track: 'On pace',
  achieved: 'Achieved',
  at_risk: 'At risk',
  behind: 'Behind pace',
  no_data: 'No pace yet',
}

/** Recommendation template → the rail's kicker word. */
export const TEMPLATE_LABELS = {
  'REC-RUBRIC-STEP': 'Rubric step',
  'REC-EVIDENCE-GAP': 'Evidence gap',
  'REC-ASSURANCE-GATE': 'Assurance gate',
  'REC-FINDING-WORK': 'Early warning',
}

/** SuggestedOwnerRole → English. Display only; it never fills a saved field. */
export const OWNER_ROLE_LABELS = {
  head_of_school: 'Head of school',
  principal: 'Principal',
  business_manager: 'Business manager',
  board_chair: 'Board chair',
  facilities_manager: 'Facilities manager',
  advancement_director: 'Advancement director',
  accreditation_lead: 'Accreditation lead',
}

// ── Formatters. Each returns null for null — never a substituted zero. ────────

/** 0..1 fraction → '42%'. null/undefined → null (the caller renders an em dash). */
export function pctLabel(fraction) {
  if (fraction == null || Number.isNaN(Number(fraction))) return null
  return `${Math.round(Number(fraction) * 100)}%`
}

/** 'yyyy-mm-dd' (or an ISO timestamp) → 'Aug 12, 2026'. null → null. */
export function shortDate(iso) {
  if (!iso) return null
  const d = new Date(`${String(iso).slice(0, 10)}T00:00:00.000Z`)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

/** Milestone rollup for display: { done, total } or null when there are none. */
export function milestoneCounts(milestones) {
  if (!Array.isArray(milestones) || milestones.length === 0) return null
  return { done: milestones.filter((m) => m?.done).length, total: milestones.length }
}

/**
 * The owner the suggested ROLE maps to, or null.
 *
 * The school members roster (GET /schools/:id/members) carries id / firstName /
 * lastName / email and an ACCESS role (owner · accountant · viewer) — it does not
 * carry a job title, so a suggestion like 'business_manager' has, in general,
 * nothing to match against. This returns a member ONLY when the roster genuinely
 * carries a matching `title`/`jobTitle`; otherwise null, and the form shows the
 * suggested role as a HINT beside an Unassigned picker rather than guessing a
 * person. Assigning the wrong colleague to accreditation work is worse than
 * assigning nobody.
 */
export function matchOwnerId(suggestedOwnerRole, members) {
  if (!suggestedOwnerRole || !Array.isArray(members)) return null
  const wanted = String(suggestedOwnerRole).replace(/_/g, ' ').toLowerCase()
  const hit = members.find((m) => {
    const title = String(m?.title ?? m?.jobTitle ?? '').replace(/_/g, ' ').trim().toLowerCase()
    return title !== '' && title === wanted
  })
  return hit?.id ?? null
}

/**
 * The RecordFlow `defaults` overlay for a clicked recommendation (§7.4). PURE:
 * the page spreads it over IMPROVEMENT_FLOW.defaults in a useMemo, so no shared
 * wizard file learns about seeding.
 *
 * `templateId` is what tells the flow (and its toBody/submit) that this draft is
 * an ADOPTION of a server-composed recommendation rather than a hand-typed
 * initiative — which is why the adopt endpoint, and its idempotency, is reachable
 * without a second wizard.
 */
export function seedFromRecommendation(rec, members = []) {
  if (!rec) return {}
  return {
    templateId: rec.templateId ?? '',
    title: rec.title ?? '',
    originType: rec.originType ?? 'manual',
    originRef: rec.originRef ?? '',
    findingKey: rec.findingKey ?? '',
    metricKey: rec.suggestedMetricKey ?? '',
    targetRubricScore:
      rec.suggestedTargetRubricScore == null ? '' : String(rec.suggestedTargetRubricScore),
    ownerUserId: matchOwnerId(rec.suggestedOwnerRole, members) ?? '',
    suggestedOwnerRole: rec.suggestedOwnerRole ?? '',
  }
}

/**
 * The RecordFlow seed for a `/improvement?rec=…&recTitle=…` deep link.
 *
 * WHY IT NEVER RETURNS NULL FOR A KEY IT DOES NOT RECOGNISE. The link is made by
 * the Accreditation page's early-warning rail, one per open finding. The
 * recommendation rail it lands on is capped at eight and ranked by index lift —
 * and a school-scoped finding carries NO lift, so it sorts below every rubric
 * step and is the first thing truncated on any school with eight-plus scored
 * gaps (the ordinary mid-accreditation case). A finding that fired since the
 * last nightly reconciliation has no ledger row to be recommended from at all.
 * Resolving the key only against the rail therefore meant "Work this gap" did
 * nothing, silently, for exactly the warnings this phase exists to act on.
 *
 * So an unmatched key is seeded FROM THE LINK: the finding's own key and title,
 * which is precisely what POST /improvement/adopt needs. Nothing is invented —
 * both values were rendered on the page the user clicked.
 */
export function seedFromDeepLink({ wanted, title = '', recommendations = [], members = [] } = {}) {
  if (!wanted) return null
  const hit = (recommendations ?? []).find(
    (r) => recommendationId(r) === wanted || r?.findingKey === wanted || r?.originRef === wanted,
  )
  if (hit) return seedFromRecommendation(hit, members)
  return {
    // Only the findings rail links here, and it links FINDINGS.
    templateId: 'REC-FINDING-WORK',
    title: String(title ?? ''),
    originType: 'finding',
    originRef: wanted,
    findingKey: wanted,
  }
}

/** A stable identity for a recommendation (findingKey when present, else origin). */
export function recommendationId(rec) {
  return rec?.findingKey ?? `${rec?.templateId ?? 'REC'}:${rec?.originRef ?? ''}`
}
