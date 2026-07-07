// ─────────────────────────────────────────────────────────────────────────────
// Scope × Lens — the role-shaping transform (Phase 1 differentiator).
//
// THE THESIS: the SAME underlying figures, reshaped into a role-bounded, role-
// correct briefing so "two people never see disagreeing numbers" — only the
// EMPHASIS (re-rank), INCLUSION (filter), and VOICE (reframe) change by role,
// never the VALUES.
//
// This module is the ONE source of lens truth, shared by BriefingService (per-
// school) AND OrgBriefingService (org fan-out), so the two surfaces are shaped
// identically. It is intentionally framework-free (no Nest decorators, no I/O,
// no recompute) and PURE — `applyLens` returns a NEW array and NEVER mutates its
// input, so it is trivially unit-testable in isolation.
//
// VALUE-SAFETY INVARIANT (the structural guarantee, asserted field-by-field in
// briefing-lens.spec.ts): applyLens may DROP an item, REORDER items, REWRITE the
// `why` string, and ATTACH an additive `voice` tag — and NOTHING else. It MUST
// NEVER alter id, severity, source, metricKey, value, dueDate, title, or link.
// That is what makes the consistency guarantee a property of the code, not a
// convention. No lens can produce a different number for the same item id.
// ─────────────────────────────────────────────────────────────────────────────
import { METRIC_KEYS } from '@finrep/analytics'
import type { MembershipRole } from '@finrep/db'
import type { AttentionItem, AttentionSeverity, AttentionSource } from './briefing.service.js'

/** A lens === a MembershipRole. We reuse the real RBAC roles (no synthetic ones). */
export type Lens = MembershipRole // 'owner' | 'accountant' | 'viewer'

/** Per-item reframing hint the FRONTEND uses to pick CTA wording / tone. Additive;
 *  the backend never rewrites a value-bearing string off the back of it. */
export type AttentionVoice = 'decision' | 'action' | 'governance'

/** Severity tiebreak — THE single source of truth, shared by both briefing services. */
export const SEV_RANK: Record<AttentionSeverity, number> = { critical: 0, warn: 1, info: 2 }

/** The legacy/default source tiebreak (data-blocking first, then compliance gaps,
 *  then metric watch-outs). Kept here so the accountant lens === today's shipped
 *  ranking byte-for-byte and existing consumers are unaffected. */
export const SOURCE_RANK: Record<AttentionSource, number> = {
  data: 0,
  compliance: 1,
  // Phase 2 — the cross-domain enrollment→cash item is a financial-health signal;
  // it sits right after compliance (before governance) in the legacy tiebreak.
  enrollment: 2,
  // AR/AP aging — a high-salience finance/cash signal; sits with enrollment (right
  // after compliance, before the board-oversight domains). ADDITIVE — inserting it
  // only shifts governance..metric down by one WITHOUT reordering them relative to
  // each other, so every pre-cash accountant snapshot stays byte-identical.
  cash: 3,
  governance: 4,
  accreditation: 5,
  facilities: 6,
  advancement: 7,
  // Strategic Planning — a board-oversight domain like advancement; sits right after
  // it in the legacy/accountant order. ADDITIVE — inserting it only shifts workflow/
  // metric down by one WITHOUT reordering them, so pre-strategy accountant snapshots
  // stay byte-identical for the existing ids.
  strategy: 8,
  workflow: 9,
  metric: 10,
}

/** Fixed sub-order for the non-metric items so the list is deterministic. */
export const COMPLIANCE_ORDER = [
  // Phase 2 — the cross-domain enrollment→cash item leads the non-metric block (it
  // never actually ties with another source on the weight step, so this index is
  // only ever consulted defensively — enrollment has a unique source weight).
  'enrollment:below-plan',
  // AR/AP aging (Cash & Collections). Grouped with the financial-health block, right
  // after enrollment; AR overdue leads AP past-due so a same-severity tie is curated,
  // not id-arbitrary. KEPT for the viewer lens (aggregate, board-legible cash matter).
  'cash:ar-overdue',
  'cash:ap-overdue',
  // Cash-flow reconciliation "trust check" (books tie to QuickBooks?). Grouped with the
  // other cash items, after the aging pair; a fiduciary trust matter so it is KEPT for
  // the viewer/board lens via the existing source==='cash' keepForViewer branch.
  'cash:reconciliation',
  'compliance:reconciliation',
  'compliance:material',
  'compliance:reportable',
  'compliance:cap-open',
  'compliance:checklist',
  // Governance policy-review items (Phase 3). Placed after the compliance items;
  // overdue before due-soon so a same-severity tie is curated, not id-arbitrary.
  'governance:policies-overdue',
  'governance:policies-due-soon',
  // Governance depth — board-meeting register items (Phase 3). Placed right after
  // the policy items (same governance source); minutes-approval (actionable, can
  // escalate critical) leads the agenda-due nudge so a same-severity tie is
  // curated, not id-arbitrary. KEPT for the viewer lens (board matter) via the
  // existing source==='governance' keepForViewer branch.
  'governance:minutes-approval-pending',
  'governance:meeting-agenda-due',
  // Accreditation items (Phase 4). Placed after governance, before workflow (both
  // board-oversight domains grouped); coverage-gap (actionable) leads the softer
  // review-approaching nudge so a same-severity tie is curated, not id-arbitrary.
  // KEPT for the viewer lens (board-relevant) — see keepForViewer.
  'accreditation:coverage-gap',
  'accreditation:review-approaching',
  // Facilities deferred-maintenance item (Phase 4). Placed after accreditation,
  // before workflow (grouped with the board-oversight domains). KEPT for the
  // viewer lens (board/capital-relevant) — see keepForViewer.
  'facilities:maintenance-backlog',
  // Advancement giving-progress item (Phase 4 — the LAST domain). Placed after
  // facilities, before workflow (grouped with the board-oversight domains). KEPT
  // for the viewer lens (board/development-relevant) — see keepForViewer.
  'advancement:giving-progress',
  // Strategic Planning items (Phase 5). Placed after advancement, before workflow
  // (grouped with the board-oversight domains); goals-behind-pace (actionable, can
  // escalate critical) leads the stale-initiative nudge, then the plan-review-due
  // info item, so same-severity ties are curated, not id-arbitrary. KEPT for the
  // viewer lens (board owns plan health) — see keepForViewer.
  'strategy:goals-behind-pace',
  'strategy:initiative-stale',
  'strategy:plan-review-due',
  // Workflow task items (Phase 3). Placed after the governance items; overdue
  // leads (actionable now), then MY personal sign-off queue, then the school-scoped
  // sign-off backlog, then upcoming, so a same-severity tie is curated, not id-
  // arbitrary. All are DROPPED for the viewer lens EXCEPT workflow:my-approvals-
  // pending (the board-chair's own sign-off queue) — see VIEWER_WORKFLOW.
  'workflow:tasks-overdue',
  'workflow:my-approvals-pending',
  'workflow:approvals-pending',
  'workflow:tasks-due-soon',
  'data:no-snapshot',
  'data:unmapped',
]

// ── EMPHASIS: per-lens source weighting ──────────────────────────────────────
// Leadership (owner) and governance (viewer) lead with the FINANCIAL SIGNAL
// (metric first), treating data/checklist hygiene as the tail. The finance
// operator (accountant) keeps today's data→compliance→metric "fix the data
// first" order — which is EXACTLY SOURCE_RANK, so accountant output is byte-
// identical to the pre-lens shipped ordering (back-compat, pinned by snapshot).
// Governance is the board's own domain, so it sits HIGH for owner/viewer (right
// after metric) and mid for the accountant (== SOURCE_RANK). Governance items are
// additive — accountant output stays byte-identical for the pre-governance ids.
// Workflow (operational tasks) sits at the very TAIL for owner/viewer (below data
// hygiene — it is "go do this" operator work, secondary to the health signal and
// governance), and for the accountant it keeps == SOURCE_RANK (workflow before
// metric) so the pre-workflow accountant snapshot stays byte-identical for the
// existing ids (workflow items are purely additive). Viewer numeric weights match
// owner but workflow items are DROPPED entirely (keepForViewer), so their weight
// is never actually consulted for the board.
// Accreditation is a board-oversight domain like governance, so it sits WITH
// governance (right after metric for owner/viewer; mid for the accountant). It is
// ADDITIVE — the accountant weighting == SOURCE_RANK, so the pre-accreditation
// accountant snapshot stays byte-identical for the existing ids.
// Facilities is a capital/board-oversight domain like governance & accreditation,
// so it sits WITH them (right after accreditation for owner/viewer; mid for the
// accountant). ADDITIVE — the accountant weighting == SOURCE_RANK, and inserting
// facilities only shifts compliance/data/workflow/metric down by one, so the
// pre-facilities accountant snapshot stays byte-identical for the existing ids.
// Advancement is a development/board-oversight domain like governance, accreditation
// & facilities, so it sits WITH them (right after facilities for owner/viewer; mid
// for the accountant). ADDITIVE — the accountant weighting == SOURCE_RANK, and
// inserting advancement only shifts workflow/metric down by one, so the pre-
// advancement accountant snapshot stays byte-identical for the existing ids.
// Phase 2 — enrollment (the cross-domain enrollment→cash item) is a financial-
// health signal, so for owner/viewer it sits WITH the metric headline (right after
// metric, ahead of the board-oversight domains); for the accountant it keeps ==
// SOURCE_RANK. ADDITIVE — enrollment is a new id, and inserting it only shifts the
// existing sources down by one WITHOUT reordering them relative to each other, so
// every pre-enrollment lens output stays byte-identical for the existing ids.
// Cash/collections (AR/AP aging) is a high-salience finance signal, so for owner/
// viewer it sits WITH the metric headline + enrollment (right after enrollment, ahead
// of the board-oversight domains); for the accountant it keeps == SOURCE_RANK.
// ADDITIVE — cash is a new source, and inserting it only shifts the existing sources
// down by one WITHOUT reordering them relative to each other, so every pre-cash lens
// output stays byte-identical for the existing ids.
// Strategic Planning (Phase 5) is a board-oversight domain like advancement, so for
// owner/viewer it sits WITH the board-oversight block (right after advancement); for
// the accountant it keeps == SOURCE_RANK. ADDITIVE — strategy is a new source, and
// inserting it only shifts the existing sources down by one WITHOUT reordering them,
// so every pre-strategy lens output stays byte-identical for the existing ids.
const SOURCE_WEIGHT: Record<Lens, Record<AttentionSource, number>> = {
  owner: { metric: 0, enrollment: 1, cash: 2, governance: 3, accreditation: 4, facilities: 5, advancement: 6, strategy: 7, compliance: 8, data: 9, workflow: 10 },
  viewer: { metric: 0, enrollment: 1, cash: 2, governance: 3, accreditation: 4, facilities: 5, advancement: 6, strategy: 7, compliance: 8, data: 9, workflow: 10 },
  accountant: { data: 0, compliance: 1, enrollment: 2, cash: 3, governance: 4, accreditation: 5, facilities: 6, advancement: 7, strategy: 8, workflow: 9, metric: 10 }, // == SOURCE_RANK
}

// ── VOICE: per-lens reframing tone (additive metadata, never a value rewrite) ──
const LENS_VOICE: Record<Lens, AttentionVoice> = {
  owner: 'decision',
  accountant: 'action',
  viewer: 'governance',
}

/** Human label for the active-lens indicator pill (FE reads this off the response). */
export const LENS_LABEL: Record<Lens, string> = {
  owner: 'Leadership view',
  accountant: 'Finance view',
  viewer: 'Board view',
}

// ── INCLUSION: the viewer (board / governance read-only) curation ─────────────
// A board member is read-only and governs OUTCOMES; they cannot and should not
// be told to "go reconcile". They keep:
//   (a) ALL metric signals (the headline health), at any severity;
//   (b) the no-snapshot get-started fact (data:no-snapshot) so an empty period
//       is not silently blank — a board needs to know a school hasn't reported;
//   (c) compliance findings ONLY when CRITICAL (a CAP-triggering material finding
//       is a governance matter that belongs in front of the board).
// Everything else — data:unmapped, and warn/info compliance (reportable,
// reconciliation, cap-assignment, year-end checklist) — is an operational chore
// a board cannot action, so it is dropped.
//
// Compliance inclusion is an EXPLICIT id allowlist (not severity==='critical') so
// it stays in LOCKSTEP with VIEWER_REFRAME: every compliance id that survives into
// the board view has a governance `why` rewrite below. If a future critical
// compliance item is added, it must be consciously added to BOTH sets — otherwise
// it would surface to the board in unreframed operator voice ("go fix this").
const VIEWER_COMPLIANCE = new Set<string>(['compliance:material'])

// The ONLY workflow items KEPT for the board/viewer lens. The school-scoped
// aggregate (workflow:approvals-pending) + overdue/due-soon operational tasks stay
// DROPPED — but the caller-scoped "awaiting YOUR sign-off" item IS a board matter
// (a board-chair approver needs to see their own decision queue), so it survives.
const VIEWER_WORKFLOW = new Set<string>(['workflow:my-approvals-pending'])

function keepForViewer(item: AttentionItem): boolean {
  if (item.source === 'metric') return true
  if (item.id === 'data:no-snapshot') return true
  // Governance policy-review IS a board matter — a board member should see overdue/
  // due-soon policy items. The whys are already governance/outcome-voiced (no "go
  // reconcile" operator CTA), so they pass through with no VIEWER_REFRAME entry.
  if (item.source === 'governance') return true
  // Accreditation status is a fiduciary/oversight matter the board OWNS and reports
  // to its accreditor — KEPT for the viewer, exactly like governance and UNLIKE
  // workflow. The whys are outcome/governance-voiced (no operator "go do" CTA), so
  // they pass through with no VIEWER_REFRAME entry.
  if (item.source === 'accreditation') return true
  // Deferred maintenance / capital backlog is a fiduciary/board/finance matter the
  // board OWNS (it drives capital planning and the reserve) — KEPT for the viewer/
  // board lens exactly like governance + accreditation, UNLIKE operational workflow
  // tasks which are DROPPED. The `why` is already outcome/governance-voiced ("Review
  // the deferred-maintenance register for capital planning" — no operator "go fix"
  // CTA), so it passes through with no VIEWER_REFRAME entry.
  if (item.source === 'facilities') return true
  // Advancement / development is a fiduciary board matter the board OWNS (giving
  // progress, campaign health drive the campaign and the reserve) — KEPT for the
  // viewer/board lens exactly like governance + accreditation + facilities, UNLIKE
  // operational workflow (dropped). The `why` is aggregate + outcome-voiced ("Review
  // the advancement register for development planning" — no per-donor PII, no
  // operator "go fix" CTA), so it passes through with no VIEWER_REFRAME entry.
  if (item.source === 'advancement') return true
  // Phase 5 — strategic plan health (goals off pace, stale initiatives, review due)
  // is a fiduciary matter the board OWNS (the board adopts and monitors the plan) —
  // KEPT for the viewer/board lens like the other oversight domains, UNLIKE
  // operational workflow (dropped). The `why` is aggregate + outcome-voiced (goal
  // counts + the worst goal's figures, no operator "go fix" CTA), so it passes
  // through with no VIEWER_REFRAME entry.
  if (item.source === 'strategy') return true
  // Phase 2 — enrollment vs plan drives tuition revenue and, downstream, cash/the
  // reserve: a fiduciary board matter the board OWNS. KEPT for the viewer/board lens
  // like the other oversight domains, UNLIKE operational workflow (dropped). The
  // `why` is aggregate + outcome-voiced (headcount vs plan, tuition/cash impact — no
  // PII, no operator "go fix" CTA), so it passes through with no VIEWER_REFRAME entry.
  if (item.source === 'enrollment') return true
  // AR/AP aging (Cash & Collections) drives cash/the reserve — a fiduciary board
  // matter the board OWNS. KEPT for the viewer/board lens like the other finance/
  // oversight domains, UNLIKE operational workflow (dropped). The item is aggregate
  // ($ + counts, NO party names) + outcome-legible, so it passes through with no
  // VIEWER_REFRAME entry (no "go fix" operator CTA to rewrite).
  if (item.source === 'cash') return true
  if (item.source === 'compliance') return VIEWER_COMPLIANCE.has(item.id)
  // Workflow (operational tasks) are DROPPED for the board EXCEPT the caller-scoped
  // "awaiting YOUR sign-off" item: open tasks / the school-scoped pending COUNT are
  // "go do this" operator chores a read-only board cannot action (same reason warn/
  // info compliance is dropped), but a board-chair's OWN sign-off queue is a board
  // matter. VIEWER_WORKFLOW is the explicit allowlist (in LOCKSTEP with VIEWER_
  // REFRAME below, exactly like VIEWER_COMPLIANCE) so a new viewer-kept workflow id
  // must be added to BOTH sets or it surfaces unreframed.
  if (item.source === 'workflow') return VIEWER_WORKFLOW.has(item.id)
  return false
}

// ── REFRAME (viewer only): rewrite the curated handful of `why` strings into
// governance/outcome voice (deterministic, no LLM). Only ids that SURVIVE the
// viewer filter need an entry; metric whys are already outcome-shaped and pass
// through untouched. The reframe returns a NEW item object with ONLY `why`
// changed — title/link/value/metricKey/dueDate/severity/source/id are never
// touched, so no number ever differs across lenses.
const VIEWER_REFRAME: Record<string, (i: AttentionItem) => string> = {
  'data:no-snapshot': () =>
    'This school has not yet reported financial statements for this period.',
  // FULL replacement (not a regex patch of the operator copy) — the board sees a
  // single, self-contained governance sentence with no "go fix it" CTA, and the
  // text does not silently break if the upstream operator `why` is reworded. The
  // item title still carries the finding count.
  'compliance:material': () =>
    'Material findings will require a corrective action plan before the next review.',
  // Governance voice for the board-chair's own sign-off queue. ONLY the `why` is
  // rewritten — id/severity/title/link/dueDate/value are untouched (value-safe), and
  // the title still carries the count N.
  'workflow:my-approvals-pending': () =>
    'You are the designated approver on the item(s) below; the board expects your decision to be recorded.',
}

// ── CEILING: a lens may only NARROW, never reveal MORE than the caller's role ──
// LENS_RANK measures NARROWNESS for the ceiling check (owner widest = 0); it is
// SEPARATE from SOURCE_WEIGHT (which measures emphasis). Keep them distinct.
const LENS_RANK: Record<Lens, number> = { owner: 0, accountant: 1, viewer: 2 }

/**
 * Clamp a requested lens to the caller's role ceiling. A lens override may only
 * NARROW/REFRAME, never widen beyond the caller's own role:
 *   - undefined        → caller's own role (the default lens)
 *   - same or narrower → honoured
 *   - wider            → SILENTLY clamped back to the ceiling (a no-op preview,
 *                        not a 403 — previewing a wider lens must never leak that
 *                        "there is more to see").
 * owner(0) may preview accountant(1)/viewer(2); accountant(1) may preview
 * viewer(2) but a request for owner clamps to accountant; viewer(2) can only
 * ever be viewer.
 */
export function clampLens(callerRole: Lens, requested?: Lens): Lens {
  if (!requested) return callerRole
  return LENS_RANK[requested] >= LENS_RANK[callerRole] ? requested : callerRole
}

/** The lenses this caller may PREVIEW = own role + every narrower lens. Lets the
 *  FE render the right "Preview as" switcher without re-deriving the clamp rule.
 *  owner → [owner, accountant, viewer]; accountant → [accountant, viewer];
 *  viewer → [viewer]. */
export function availableLensesFor(callerRole: Lens): Lens[] {
  return (['owner', 'accountant', 'viewer'] as Lens[]).filter(
    (l) => LENS_RANK[l] >= LENS_RANK[callerRole],
  )
}

/**
 * PROJECT the already-ranked AttentionItem[] through a lens. PURE — operates on a
 * COPY, never mutates the input. Three ordered sub-steps:
 *   1) FILTER (inclusion)  — viewer curates; owner/accountant keep everything.
 *   2) RERANK (emphasis)   — severity-first, then the lens source weight, then
 *      the SAME secondary tiebreaks as briefing.service (METRIC_KEYS index for
 *      metric pairs, COMPLIANCE_ORDER index otherwise, id.localeCompare last).
 *   3) REFRAME (voice)     — attach the lens `voice` tag to every item; for the
 *      viewer, additionally rewrite the curated `why` strings into governance
 *      voice. VALUES are never touched.
 */
export function applyLens(items: readonly AttentionItem[], lens: Lens): AttentionItem[] {
  // 1) FILTER
  const kept = lens === 'viewer' ? items.filter(keepForViewer) : items.slice()

  // 2) RERANK (stable, total-ordered by the final id tiebreak → deterministic)
  const weight = SOURCE_WEIGHT[lens]
  kept.sort((a, b) => {
    const sev = SEV_RANK[a.severity] - SEV_RANK[b.severity]
    if (sev !== 0) return sev
    const src = weight[a.source] - weight[b.source]
    if (src !== 0) return src
    if (a.source === 'metric' && b.source === 'metric') {
      const mi =
        METRIC_KEYS.indexOf(a.metricKey as never) - METRIC_KEYS.indexOf(b.metricKey as never)
      if (mi !== 0) return mi
    } else {
      const ci = COMPLIANCE_ORDER.indexOf(a.id) - COMPLIANCE_ORDER.indexOf(b.id)
      if (ci !== 0) return ci
    }
    return a.id.localeCompare(b.id)
  })

  // 3) REFRAME — attach voice + (viewer only) governance-rewrite the curated whys.
  const voice = LENS_VOICE[lens]
  return kept.map((item) => {
    const reframe = lens === 'viewer' ? VIEWER_REFRAME[item.id] : undefined
    const why = reframe ? reframe(item) : item.why
    return { ...item, why, voice }
  })
}
