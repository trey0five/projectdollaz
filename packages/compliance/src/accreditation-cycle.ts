// ─────────────────────────────────────────────────────────────────────────────
// WS3 F1 — the SIX-YEAR ACCREDITATION CYCLE engine (pure).
//
// A cycle is a road, not a gauge: the school anchors it with the date of its
// last Engagement Review, and every milestone below is BACK-PLANNED from that
// anchor against the verified Cognia process (findings shared in year 1,
// implement-and-gather in years 2–3, the Accreditation Progress Report in year
// 4, the Self-Assessment run-up in years 5–6, evidence upload ~4 weeks before
// the review, then the Engagement Review itself). The same shape serves every
// framework — only the anchor and term length are the school's.
//
// HONESTY RULES (the HorizonTimeline discipline applied to time):
//   • Every `not_measurable` milestone carries a VERBATIM reason — a milestone
//     we cannot measure is a sentence, never a grey dot.
//   • Thresholds are FEW, INTEGER, and PRINTED in the payload's own text, so
//     they are contestable. Never a probability.
//   • Every figure in a measure's text is copied from the inputs — the engine
//     does no arithmetic a reader could not check on paper.
//
// DETERMINISM CONTRACT: obeys the package PURITY GUARD — no Date, no clock, no
// I/O, no randomness. `now` is an INJECTED yyyy-mm-dd civil day.
// ─────────────────────────────────────────────────────────────────────────────

import { addMonths, civilFromDays, civilToIso, daysFromCivil, toCivil } from './review-status.js'

export const CYCLE_MILESTONE_KEYS = [
  'findings_shared',
  'implementing',
  'progress_report',
  'self_assessment',
  'evidence_freeze',
  'review_year',
] as const
export type CycleMilestoneKey = (typeof CYCLE_MILESTONE_KEYS)[number]

export type CycleMilestoneState =
  | 'done'
  | 'on_track'
  | 'at_risk'
  | 'overdue'
  | 'upcoming'
  | 'not_measurable'

/** Evidence upload lands in the accreditor portal ~4 weeks before the review. */
export const EVIDENCE_FREEZE_LEAD_DAYS = 28
/** progress_report is at_risk inside this window with under half findings answered. */
export const PROGRESS_REPORT_RISK_WINDOW_DAYS = 183
/** evidence_freeze is at_risk inside this window with defensible readiness under half. */
export const EVIDENCE_FREEZE_RISK_WINDOW_DAYS = 180

export interface CycleMeasure {
  kind:
    | 'prior_findings_entered'
    | 'evidence_currency'
    | 'prior_findings_closed'
    | 'scored'
    | 'defensible'
    | 'readiness_pair'
  num: number
  den: number | null
  /** The rendered sentence. Server strings, figures copied from the inputs. */
  text: string
}

export interface CycleMilestone {
  key: CycleMilestoneKey
  label: string
  /** yyyy-mm-dd for point milestones; null for windowed ones. */
  dueDate: string | null
  /** Inclusive civil window for the two multi-year phases; null for points. */
  window: { start: string; end: string } | null
  state: CycleMilestoneState
  measure: CycleMeasure | null
  /** VERBATIM sentence, present iff state === 'not_measurable'. */
  reason: string | null
  /** In-app door (?center=…, the briefing's convention — never ?tab=). */
  link: string
}

export interface CyclePhase {
  key: 'findings_shared' | 'implementing' | 'progress_report' | 'self_assessment' | 'review_year'
  /** 1-based year inside the cycle, clamped to [1, termYears]. */
  yearOfCycle: number
  label: string
  narrative: string
}

export interface CycleCountdown {
  milestoneKey: CycleMilestoneKey
  label: string
  dueDate: string
  daysRemaining: number
}

export interface CycleAnchor {
  lastReviewDate: string
  /** Explicit override, else derived = lastReviewDate + termYears. */
  nextReviewDate: string
  termYears: number
  source: 'manual' | 'derived_prior_visit'
}

export interface CycleEngineInput {
  /** yyyy-mm-dd civil day — INJECTED, never read from a clock. */
  now: string
  anchor: {
    lastReviewDate: string
    nextReviewDate: string | null
    termYears: number
    source: 'manual' | 'derived_prior_visit'
  }
  /** null = the prior-visit register could not be read (≠ zero findings). */
  priorFindings: { total: number; closed: number } | null
  /** null = the readiness read failed or no register exists. */
  readiness: {
    leafCount: number
    scoredCount: number
    selfScoredPct: number
    verifiedPct: number
    projectedIndex: number | null
    band: string | null
  } | null
  /** null = evidence currency has never been rated. */
  evidenceHealth: {
    evidenceHealthPct: number | null
    rated: number
    current: number
    expiring: number
  } | null
  /** null = unreadable; else assurance gates satisfied / total. */
  assurances: { total: number; satisfied: number } | null
  /** Evidence rows the school has marked as also in the accreditor portal; null = unreadable. */
  alsoInPortalCount: number | null
}

export interface ComposedCycle {
  anchor: CycleAnchor
  today: string
  phase: CyclePhase
  countdown: CycleCountdown | null
  milestones: CycleMilestone[]
}

// ── Civil-day helpers (pure; the review-status primitives do the real work) ──

function dayNum(iso: string): number | null {
  const c = toCivil(iso)
  return c === null ? null : daysFromCivil(c.y, c.m, c.d)
}

function plusMonths(iso: string, months: number): string {
  const c = toCivil(iso)
  if (c === null) return iso
  return civilToIso(addMonths(c, months))
}

function plusDays(iso: string, days: number): string {
  const n = dayNum(iso)
  if (n === null) return iso
  return civilToIso(civilFromDays(n + days))
}

const MONTH_ABBR = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const

/** yyyy-mm-dd → "12 Apr 2028" (falls back to the raw string when unparseable). */
function formatDay(iso: string): string {
  const c = toCivil(iso)
  if (c === null) return iso
  return `${c.d} ${MONTH_ABBR[c.m - 1]} ${c.y}`
}

const NOT_MEASURABLE = {
  noPriorFindingsShared:
    'No prior-visit findings are on file, so we cannot say whether they were shared.',
  noPriorFindingsAnswered:
    'No prior-visit findings are on file, so we cannot say whether they were answered.',
  noEvidenceRating:
    'Evidence currency has not been rated yet, so interim-year accrual cannot be measured.',
  noRegister:
    'No standards are on the register yet, so self-assessment progress cannot be measured.',
  noReadiness:
    'The readiness register could not be read, so this milestone cannot be measured.',
  noPortalAssertion:
    'No evidence has been marked as uploaded to the accreditor portal, and we cannot see the portal itself.',
} as const

const PHASE_LABELS: Record<CyclePhase['key'], string> = {
  findings_shared: 'Findings & stakeholder sharing',
  implementing: 'Implement & gather evidence of impact',
  progress_report: 'Progress Report year',
  self_assessment: 'Self-Assessment run-up',
  review_year: 'Review year',
}

/**
 * Compose the full cycle payload from an anchored last review + live register
 * facts. Deterministic: same input (including `now`) → same output.
 */
export function composeCycle(input: CycleEngineInput): ComposedCycle {
  const termYears = input.anchor.termYears > 0 ? input.anchor.termYears : 6
  const lastReview = input.anchor.lastReviewDate
  const nextReview = input.anchor.nextReviewDate ?? plusMonths(lastReview, termYears * 12)
  const anchor: CycleAnchor = {
    lastReviewDate: lastReview,
    nextReviewDate: nextReview,
    termYears,
    source: input.anchor.source,
  }

  const today = input.now.slice(0, 10)
  const nowN = dayNum(today) ?? 0

  // ── Milestone dates, all back-planned from the anchor ──
  const findingsSharedDue = plusMonths(lastReview, 12)
  const implementingStart = plusMonths(lastReview, 12)
  const implementingEnd = plusMonths(lastReview, 36)
  const progressReportDue = plusMonths(lastReview, 48)
  const selfAssessStart = plusMonths(lastReview, 48)
  const selfAssessEnd = nextReview
  const evidenceFreezeDue = plusDays(nextReview, -EVIDENCE_FREEZE_LEAD_DAYS)

  const n = (iso: string): number => dayNum(iso) ?? 0

  // ── findings_shared (year 1) ──
  const pf = input.priorFindings
  const findingsShared: CycleMilestone = {
    key: 'findings_shared',
    label: 'Findings shared with stakeholders',
    dueDate: findingsSharedDue,
    window: null,
    state: 'not_measurable',
    measure: null,
    reason: null,
    link: '/accreditation?center=evidence',
  }
  if (pf === null || pf.total === 0) {
    findingsShared.reason = NOT_MEASURABLE.noPriorFindingsShared
  } else {
    findingsShared.measure = {
      kind: 'prior_findings_entered',
      num: pf.total,
      den: null,
      text: `${pf.total} prior-visit finding${pf.total === 1 ? ' is' : 's are'} on file`,
    }
    findingsShared.state = nowN >= n(findingsSharedDue) ? 'done' : 'on_track'
  }

  // ── implementing (years 2–3 window) ──
  const eh = input.evidenceHealth
  const implementing: CycleMilestone = {
    key: 'implementing',
    label: 'Implement & gather evidence of impact',
    dueDate: null,
    window: { start: implementingStart, end: implementingEnd },
    state: 'not_measurable',
    measure: null,
    reason: null,
    link: '/accreditation?center=evidence',
  }
  if (eh === null || eh.evidenceHealthPct === null) {
    implementing.reason = NOT_MEASURABLE.noEvidenceRating
  } else {
    implementing.measure = {
      kind: 'evidence_currency',
      num: eh.evidenceHealthPct,
      den: 100,
      text: `${eh.evidenceHealthPct}% of rated evidence is current (${eh.current} current, ${eh.expiring} expiring) of ${eh.rated} rated`,
    }
    // Same-day consistency (n2): the phase comparator below treats the
    // implementingEnd DAY as already progress_report (`nowN >= end`), so the
    // milestone must read done that day too — `>=`, not `>`, or the page says
    // "Progress Report year" while this row still claims the window is open.
    implementing.state =
      nowN < n(implementingStart) ? 'upcoming' : nowN >= n(implementingEnd) ? 'done' : 'on_track'
  }

  // ── progress_report (year 4) ──
  const progressReport: CycleMilestone = {
    key: 'progress_report',
    label: 'Accreditation Progress Report',
    dueDate: progressReportDue,
    window: null,
    state: 'not_measurable',
    measure: null,
    reason: null,
    link: '/accreditation?center=evidence',
  }
  if (pf === null || pf.total === 0) {
    progressReport.reason = NOT_MEASURABLE.noPriorFindingsAnswered
  } else {
    const answered = pf.closed
    progressReport.measure = {
      kind: 'prior_findings_closed',
      num: answered,
      den: pf.total,
      text: `${answered} of ${pf.total} prior-visit findings answered`,
    }
    const daysToDue = n(progressReportDue) - nowN
    if (daysToDue < 0) {
      progressReport.state = answered >= pf.total ? 'done' : 'overdue'
    } else if (daysToDue <= PROGRESS_REPORT_RISK_WINDOW_DAYS && answered * 2 < pf.total) {
      progressReport.state = 'at_risk'
      progressReport.measure.text = `${answered} of ${pf.total} prior-visit findings answered — fewer than half, with the report due within ${PROGRESS_REPORT_RISK_WINDOW_DAYS} days`
    } else if (daysToDue > PROGRESS_REPORT_RISK_WINDOW_DAYS) {
      progressReport.state = 'upcoming'
    } else {
      progressReport.state = 'on_track'
    }
  }

  // ── self_assessment (years 5–6 window) ──
  const rd = input.readiness
  const selfAssessment: CycleMilestone = {
    key: 'self_assessment',
    label: 'Self-Assessment: ratings + analyses',
    dueDate: null,
    window: { start: selfAssessStart, end: selfAssessEnd },
    state: 'not_measurable',
    measure: null,
    reason: null,
    link: '/accreditation?center=standards',
  }
  if (rd === null) {
    selfAssessment.reason = NOT_MEASURABLE.noReadiness
  } else if (rd.leafCount === 0) {
    selfAssessment.reason = NOT_MEASURABLE.noRegister
  } else {
    const asr = input.assurances
    const assuranceClause =
      asr !== null && asr.total > 0 ? `; ${asr.satisfied} of ${asr.total} assurances satisfied` : ''
    selfAssessment.measure = {
      kind: 'scored',
      num: rd.scoredCount,
      den: rd.leafCount,
      text: `${rd.scoredCount} of ${rd.leafCount} standards self-rated${assuranceClause}`,
    }
    const startN = n(selfAssessStart)
    const endN = n(selfAssessEnd)
    if (nowN < startN) {
      selfAssessment.state = 'upcoming'
    } else if (nowN > endN) {
      selfAssessment.state = rd.scoredCount >= rd.leafCount ? 'done' : 'overdue'
    } else {
      const windowHalfGone = nowN - startN >= endN - nowN
      if (windowHalfGone && rd.scoredCount * 2 < rd.leafCount) {
        selfAssessment.state = 'at_risk'
        selfAssessment.measure.text = `${rd.scoredCount} of ${rd.leafCount} standards self-rated${assuranceClause} — fewer than half, with the window half gone`
      } else {
        selfAssessment.state = 'on_track'
      }
    }
  }

  // ── evidence_freeze (nextReview − 28d) ──
  const evidenceFreeze: CycleMilestone = {
    key: 'evidence_freeze',
    label: 'Evidence uploaded to accreditor portal',
    dueDate: evidenceFreezeDue,
    window: null,
    state: 'not_measurable',
    measure: null,
    reason: null,
    link: '/accreditation?center=evidence',
  }
  if (rd === null) {
    evidenceFreeze.reason = NOT_MEASURABLE.noReadiness
  } else {
    const portal = input.alsoInPortalCount
    const expiringClause =
      eh !== null && eh.expiring > 0 ? `; ${eh.expiring} artifact${eh.expiring === 1 ? '' : 's'} expiring` : ''
    const portalClause =
      portal !== null && portal > 0
        ? `; ${portal} artifact${portal === 1 ? '' : 's'} marked as in the portal`
        : ''
    evidenceFreeze.measure = {
      kind: 'defensible',
      num: rd.verifiedPct,
      den: 100,
      text: `Defensible readiness is ${rd.verifiedPct}%${expiringClause}${portalClause}`,
    }
    const daysToDue = n(evidenceFreezeDue) - nowN
    if (daysToDue < 0) {
      if (portal !== null && portal > 0) {
        evidenceFreeze.state = 'done'
      } else {
        evidenceFreeze.state = 'overdue'
        evidenceFreeze.measure.text = `${evidenceFreeze.measure.text}. ${NOT_MEASURABLE.noPortalAssertion}`
      }
    } else if (daysToDue <= EVIDENCE_FREEZE_RISK_WINDOW_DAYS && rd.verifiedPct * 2 < 100) {
      evidenceFreeze.state = 'at_risk'
      evidenceFreeze.measure.text = `Defensible readiness is ${rd.verifiedPct}% — under half, with the upload due within ${EVIDENCE_FREEZE_RISK_WINDOW_DAYS} days${expiringClause}${portalClause}`
    } else if (daysToDue > EVIDENCE_FREEZE_RISK_WINDOW_DAYS) {
      evidenceFreeze.state = 'upcoming'
    } else {
      evidenceFreeze.state = 'on_track'
    }
  }

  // ── review_year (nextReview) ──
  const reviewYear: CycleMilestone = {
    key: 'review_year',
    label: 'Engagement Review',
    dueDate: nextReview,
    window: null,
    state: 'not_measurable',
    measure: null,
    reason: null,
    link: '/accreditation?center=domains',
  }
  if (rd === null) {
    reviewYear.reason = NOT_MEASURABLE.noReadiness
  } else {
    const bandClause =
      rd.projectedIndex !== null && rd.band !== null
        ? `; projected index ${rd.projectedIndex} (${rd.band})`
        : ''
    reviewYear.measure = {
      kind: 'readiness_pair',
      num: rd.selfScoredPct,
      den: 100,
      text: `${rd.selfScoredPct}% documented, ${rd.verifiedPct}% defensible${bandClause}`,
    }
    const daysToDue = n(nextReview) - nowN
    // n13 (accepted as-is): 'done' here is CALENDAR-done — the review date has
    // passed; whether the visit actually happened is the accreditor's fact.
    reviewYear.state = daysToDue < 0 ? 'done' : daysToDue <= 365 ? 'on_track' : 'upcoming'
  }

  const milestones: CycleMilestone[] = [
    findingsShared,
    implementing,
    progressReport,
    selfAssessment,
    evidenceFreeze,
    reviewYear,
  ]

  // ── Countdown: the NEXT dated deadline (window phases count by their end) ──
  let countdown: CycleCountdown | null = null
  for (const m of milestones) {
    const due = m.dueDate ?? m.window?.end ?? null
    if (due === null) continue
    const dn = dayNum(due)
    if (dn === null || dn < nowN) continue
    if (countdown === null || dn - nowN < countdown.daysRemaining) {
      countdown = { milestoneKey: m.key, label: m.label, dueDate: due, daysRemaining: dn - nowN }
    }
  }

  // ── Phase: which stretch of the road today falls on ──
  const lastN = n(lastReview)
  const rawYear = Math.floor((nowN - lastN) / 365.2425) + 1
  const yearOfCycle = Math.min(Math.max(rawYear, 1), termYears)
  let phaseKey: CyclePhase['key']
  if (nowN >= n(nextReview)) phaseKey = 'review_year'
  else if (nowN >= n(selfAssessStart)) phaseKey = 'self_assessment'
  else if (nowN >= n(implementingEnd)) phaseKey = 'progress_report'
  else if (nowN >= n(implementingStart)) phaseKey = 'implementing'
  else phaseKey = 'findings_shared'
  const phaseSentence: Record<CyclePhase['key'], string> = {
    findings_shared:
      'Year 1 is for sharing the last review’s findings with stakeholders and logging them on the register.',
    implementing:
      'Years 2–3 are for evidence of impact: implement, and let the artifacts accrue as you go.',
    progress_report: `Year 4 is Progress Report year: each prior-visit finding needs an answer by ${formatDay(progressReportDue)}.`,
    self_assessment:
      'The Self-Assessment window is open: self-rate every standard and complete the analyses.',
    review_year: `Your Engagement Review anchors this cycle on ${formatDay(nextReview)}.`,
  }
  const phase: CyclePhase = {
    key: phaseKey,
    yearOfCycle,
    label: PHASE_LABELS[phaseKey],
    narrative: `You are in year ${yearOfCycle} of your ${termYears}-year cycle. ${phaseSentence[phaseKey]}`,
  }

  return { anchor, today, phase, countdown, milestones }
}
