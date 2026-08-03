// ─────────────────────────────────────────────────────────────────────────────
// /accreditation/visit — THE MOCK VISIT (AIC Phase H).
//
// Six acts, in order, on one page: the team is here → what they'd commend → what
// they'd likely find → what they'd ask for → WHAT WE COULD NOT ANSWER → so here's
// the plan. It is the rehearsal a school pays for: everything a visiting team
// would raise, under the standard codes they would raise it under, each argued
// from readings the head of school can click through to and check.
//
// ONE PAYLOAD, ONE COMPOSER, NO CLIENT COMPOSITION. `GET /accreditation/visit`
// arrives fully rendered from the single pure `composeMockVisit`. Every rationale,
// consequence, basis `display`, unlock sentence, commendation caveat, evidence
// health line, empty-plan reason and executive-summary segment is printed
// verbatim. This page contributes act headings, layout and controls — and the
// only numerals it emits are the act numbers and the length of an array already
// on screen.
//
// ACT 5 IS NOT COLLAPSIBLE AND IS NOT BEHIND A TAB. Six <ActSection>s render in
// sequence, all open, on every load. `ActSection` takes no prop that could hide
// content, and the honesty spec asserts Act 5's holes, its full 36-row roster and
// its not-evaluated rules are all in the DOM. It is the act that makes Acts 3 and
// 6 believable, and every unmeasured domain on it is a module or an intake we can
// sell.
//
// THE SPOKEN SUMMARY AND THE PRINTED ONE ARE THE SAME SENTENCES. Both read
// `visit.executiveSummary.segments`: <ExecutiveSummary> renders them, and
// `useNarrationPlayer(segments, schoolId)` speaks the same objects. No segment is
// filtered, reordered or re-worded on either path — that equality is acceptance 3
// and it is proved in `visit-print.spec.jsx`.
//
// NO LLM ON THIS PATH. Not in the drafter, not in the summary, not in the
// narration — the narration player is a TTS transport being handed sentences the
// deterministic composer already wrote. Penny's advisory layer is a later phase.
//
// AN UNLICENSED SCHOOL UPSELLS AND NEVER CRASHES: the module 402 renders the
// Accreditation panel, a plain 402 renders the paused-subscription panel, and a
// viewer sees every act plus the draft plan with no adopt control (the write is
// owner/accountant, server-enforced — a dead button would be worse than none).
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useReducedMotion } from 'framer-motion'
import {
  Award,
  BadgeCheck,
  ClipboardList,
  FileText,
  Landmark,
  Lightbulb,
  Pause,
  Play,
  Printer,
  ScanSearch,
  Sparkles,
} from 'lucide-react'
import BillingBanner from '../components/BillingBanner.jsx'
import BackLink from '../components/ui/BackLink.jsx'
import ExecutiveSummary from '../components/accreditation/ExecutiveSummary.jsx'
import ActSection from '../components/accreditation/visit/ActSection.jsx'
import ActArrival from '../components/accreditation/visit/ActArrival.jsx'
import ActCommendations from '../components/accreditation/visit/ActCommendations.jsx'
import ActFindings from '../components/accreditation/visit/ActFindings.jsx'
import ActRequests from '../components/accreditation/visit/ActRequests.jsx'
import ActUnanswered from '../components/accreditation/visit/ActUnanswered.jsx'
import ActPlan, { planItemId } from '../components/accreditation/visit/ActPlan.jsx'
import PlanConfirmCard from '../components/accreditation/visit/PlanConfirmCard.jsx'
import { useNarrationPlayer } from '../components/penny/hooks/useNarrationPlayer.js'
import { useSchools } from '../context/SchoolContext.jsx'
import { useVisit } from '../hooks/useVisit.js'
import { improvementApi, schoolsApi } from '../lib/api.js'

const HUE = '#F59E0B'

/** The six acts, in the order a visiting team lives them. Frozen. */
const ACTS = [
  { key: 'arrival', title: 'The team is here', Icon: Landmark },
  { key: 'commendations', title: "What they'd commend", Icon: Award },
  { key: 'findings', title: "What they'd likely find", Icon: BadgeCheck },
  { key: 'requests', title: "What they'd ask for", Icon: ClipboardList },
  { key: 'unanswered', title: 'What we could not answer', Icon: ScanSearch },
  { key: 'plan', title: "So here's the plan", Icon: Lightbulb },
]

const KICKERS = {
  arrival:
    'What a visiting team would see on arrival: the framework, what you have documented, what you can defend, and how much of our rule catalog we could evaluate at all.',
  commendations:
    'A strength is only claimed when three things hold at once — a strong self-score, current evidence, and an independently derived operating figure that agrees. Zero is a legitimate answer and is never padded.',
  findings:
    'Grouped under the standard codes a team would raise them under. Each card opens to the readings it rests on, and every reading links to the register it came from.',
  requests:
    'The evidence index a team would work from — grouped by artifact, not by standard, because one audit can serve nine standards.',
  unanswered:
    'The questions a visiting team asks that we could not answer, and precisely why. A rule we could not run is not a rule that passed.',
  plan: 'Drafted from your own gaps and warnings. Nothing is written until you confirm.',
}

function CenteredPanel({ children }) {
  return (
    <div className="mx-auto max-w-page space-y-4 px-4 py-6 sm:px-10 sm:py-8">
      <BackLink fallback="/accreditation" fallbackLabel="Back to Accreditation" />
      <div className="card-soft flex flex-col items-center gap-3 px-6 py-14 text-center">
        <span
          className="flex h-14 w-14 items-center justify-center rounded-2xl text-white shadow-glow"
          style={{ background: HUE }}
        >
          <BadgeCheck size={26} />
        </span>
        {children}
      </div>
    </div>
  )
}

function GatePanel({ notLicensed }) {
  return (
    <CenteredPanel>
      {notLicensed ? (
        <>
          <h2 className="font-serif text-xl font-semibold text-navy">
            The mock visit rides on Accreditation
          </h2>
          <p className="max-w-md text-[15px] text-muted">
            Add the Accreditation module to rehearse the visit — what a team would commend, what
            they would likely find under each standard, and what we cannot answer for you yet.
          </p>
        </>
      ) : (
        <>
          <h2 className="font-serif text-xl font-semibold text-navy">Your subscription is paused</h2>
          <p className="max-w-md text-[15px] text-muted">
            Resume your plan to run the mock visit.
          </p>
        </>
      )}
    </CenteredPanel>
  )
}

function PrintLink({ to, children }) {
  return (
    <Link
      to={to}
      className="inline-flex items-center gap-1.5 rounded-full border border-rule/70 bg-white px-3.5 py-1.5 text-[12.5px] font-semibold text-navy transition hover:border-[#F59E0B]/60"
    >
      <Printer size={13} aria-hidden /> {children}
    </Link>
  )
}

function VisitWorkspace() {
  const { activeSchool } = useSchools()
  const schoolId = activeSchool?.id ?? null
  const canEdit = activeSchool?.role === 'owner' || activeSchool?.role === 'accountant'
  const reduce = useReducedMotion()

  const {
    visit,
    arrival,
    commendations,
    findings,
    requests,
    unanswered,
    plan,
    summarySegments,
    disclaimer,
    demoData,
    loading,
    error,
    notLicensed,
    notEntitled,
    refresh,
  } = useVisit(schoolId)

  // The spoken half of acceptance 3. Handed the SAME segment objects the printed
  // <ExecutiveSummary> renders — no filter, no map, no re-order.
  const player = useNarrationPlayer(summarySegments, schoolId)

  // ── The owner picker's roster ──────────────────────────────────────────────
  // Editor-only endpoint; a viewer 403s → keep [] and the confirm card simply
  // omits the Owner control. It never blocks the page.
  const [members, setMembers] = useState([])
  useEffect(() => {
    let cancelled = false
    Promise.resolve().then(() => {
      if (cancelled) return
      if (!schoolId || !canEdit) {
        setMembers([])
        return
      }
      schoolsApi
        .members(schoolId)
        .then((res) => {
          if (!cancelled) setMembers(Array.isArray(res.data) ? res.data : (res.data?.members ?? []))
        })
        .catch(() => {
          if (!cancelled) setMembers([])
        })
    })
    return () => {
      cancelled = true
    }
  }, [schoolId, canEdit])

  // ── Act 6 selection ────────────────────────────────────────────────────────
  // Every drafted item starts selected: the draft IS the proposal, and a card
  // that opens with nothing ticked makes the reader re-do the server's work.
  const planItems = useMemo(() => (Array.isArray(plan?.items) ? plan.items : []), [plan])
  const [selectedIds, setSelectedIds] = useState(null)
  const [confirming, setConfirming] = useState(false)
  /**
   * HAS THE OPEN CONFIRM CARD ALREADY RUN? A ref, not state, because the effect
   * below must read the value the click handler just wrote without waiting for a
   * render.
   *
   * This exists because the reset effect used to tear the card down the instant a
   * run finished: `onDone` refetches, the new payload gives `plan.items` a new
   * identity, this effect fires and `setConfirming(false)` unmounts the card —
   * milliseconds after it rendered "1 created · 1 failed — retry". The user was
   * left on Act 6 with the failed row silently back in the draft, re-ticked by
   * default, and no indication anything had failed. A partial failure that is not
   * reported is a partial failure that is not fixed.
   */
  const cardRanRef = useRef(false)
  // Microtask-defer + cancelled flag, the same shape every hook in this app uses:
  // no setState runs synchronously in an effect body, so a refetch cannot cascade
  // renders through the six acts.
  useEffect(() => {
    let cancelled = false
    Promise.resolve().then(() => {
      if (cancelled) return
      // A card that has run OWNS the screen until the user dismisses it. It has
      // frozen the rows it ran, so it keeps reporting on them regardless of what
      // the refetched draft now holds.
      if (cardRanRef.current) return
      setSelectedIds(new Set(planItems.map(planItemId)))
      setConfirming(false)
    })
    return () => {
      cancelled = true
    }
  }, [planItems])

  /** Dismiss the confirm card and re-sync the selection to the refetched draft. */
  const closeConfirm = useCallback(() => {
    cardRanRef.current = false
    setConfirming(false)
    setSelectedIds(new Set(planItems.map(planItemId)))
  }, [planItems])

  /** The run finished. Mark it, THEN refetch — the effect reads the ref. */
  const onConfirmDone = useCallback(() => {
    cardRanRef.current = true
    return refresh()
  }, [refresh])

  const toggle = useCallback((id) => {
    setSelectedIds((cur) => {
      const next = new Set(cur ?? [])
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const selectedItems = useMemo(
    () => planItems.filter((i) => selectedIds?.has(planItemId(i))),
    [planItems, selectedIds],
  )

  /**
   * ONE adopt call per row, through Phase G's existing, idempotent endpoint.
   * The body carries EXACTLY the fields `AdoptRecommendationDto` whitelists — the
   * global `forbidNonWhitelisted` pipe 400s on anything else, so `estimatedLift`,
   * `rationale` and `standardTags` (which the draft carries for rendering) are
   * deliberately NOT sent.
   */
  const adoptOne = useCallback(
    (item, { ownerUserId, dueDate }) =>
      improvementApi.adopt(schoolId, {
        templateId: item.templateId,
        originType: item.originType,
        originRef: item.originRef,
        ...(item.findingKey ? { findingKey: item.findingKey } : {}),
        title: item.title,
        ...(ownerUserId ? { ownerUserId } : {}),
        ...(dueDate ? { dueDate } : {}),
        ...(item.suggestedTargetRubricScore != null
          ? { targetRubricScore: item.suggestedTargetRubricScore }
          : {}),
        ...(item.suggestedMetricKey ? { metricKey: item.suggestedMetricKey } : {}),
      }),
    [schoolId],
  )

  if (notLicensed || notEntitled) return <GatePanel notLicensed={notLicensed} />

  if (loading && !visit) {
    return (
      <div className="mx-auto max-w-page space-y-3 px-4 py-8 sm:px-10">
        <div className="h-24 animate-pulse rounded-3xl bg-section" />
        <div className="h-64 animate-pulse rounded-3xl bg-section" />
        <div className="h-64 animate-pulse rounded-3xl bg-section" />
      </div>
    )
  }

  if (!visit) {
    return (
      <CenteredPanel>
        <h2 className="font-serif text-xl font-semibold text-navy">
          The mock visit is unavailable right now
        </h2>
        <p className="max-w-md text-[15px] text-muted">
          {error || 'Reload to try again. Nothing about your register has changed.'}
        </p>
      </CenteredPanel>
    )
  }

  const bodyFor = {
    arrival: <ActArrival arrival={arrival} demoData={demoData} />,
    commendations: <ActCommendations commendations={commendations} />,
    findings: (
      <ActFindings findings={findings} schoolLevelNote={findings?.schoolLevelNote ?? ''} />
    ),
    requests: <ActRequests requests={requests} framework={visit.framework ?? null} />,
    unanswered: <ActUnanswered unanswered={unanswered} />,
    plan: (
      <div className="space-y-3">
        <ActPlan
          plan={plan}
          canEdit={canEdit}
          selectedIds={selectedIds}
          onToggle={toggle}
          onStart={() => {
            cardRanRef.current = false
            setConfirming(true)
          }}
        />
        {confirming && canEdit ? (
          <PlanConfirmCard
            items={selectedItems}
            members={members}
            adopt={adoptOne}
            onCancel={closeConfirm}
            onDone={onConfirmDone}
          />
        ) : null}
      </div>
    ),
  }

  const asideFor = {
    findings: findings?.severityCounts ? (
      <span className="rounded-full border border-rule/60 bg-section px-2.5 py-1 text-[12px] font-semibold text-muted">
        {findings.severityCounts.total} in all
      </span>
    ) : null,
    plan:
      typeof plan?.moreAvailable === 'number' && plan.moreAvailable > 0 ? (
        <span className="rounded-full border border-rule/60 bg-section px-2.5 py-1 text-[12px] font-semibold text-muted">
          top {plan.limit ?? planItems.length}
        </span>
      ) : null,
  }

  return (
    <div className="mx-auto max-w-page space-y-4 px-4 py-6 sm:px-10 sm:py-8">
      <div className="flex flex-wrap items-center gap-3">
        <BackLink fallback="/accreditation" fallbackLabel="Back to Accreditation" />
        <span className="flex-1" />
        <PrintLink to="/accreditation/board/print">Board one-pager</PrintLink>
        <PrintLink to="/accreditation/visit/print">Visiting-team preview</PrintLink>
      </div>

      {error ? (
        <p className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-2 text-[13px] font-semibold text-danger">
          {error}
        </p>
      ) : null}

      {/* ── The hero + the executive summary, printed and speakable ─────────── */}
      <header className="rounded-3xl border border-rule/60 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-wrap items-start gap-3">
          <span
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-white shadow-glow"
            style={{ background: HUE }}
            aria-hidden
          >
            <Sparkles size={22} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
              Accreditation · rehearsal, not a verdict
            </p>
            <h1 className="font-serif text-[26px] font-semibold leading-tight text-navy">
              The mock visit
            </h1>
            <p className="mt-1 max-w-[72ch] text-[13px] leading-relaxed text-muted">
              {visit.framework?.name ? `${visit.framework.name} · ` : ''}
              {arrival?.asOfLine}
            </p>
          </div>
          {player.supported && summarySegments.length > 0 ? (
            <button
              type="button"
              onClick={() => (player.playing ? player.pause() : player.play())}
              className="inline-flex items-center gap-1.5 rounded-full border border-rule/70 bg-white px-3.5 py-1.5 text-[12.5px] font-semibold text-navy transition hover:border-[#F59E0B]/60"
            >
              {player.playing ? <Pause size={13} aria-hidden /> : <Play size={13} aria-hidden />}
              {player.playing ? 'Pause' : 'Read it to me'}
            </button>
          ) : null}
        </div>

        <ExecutiveSummary
          segments={summarySegments}
          title="The executive summary"
          className="mt-3 border-t border-rule/50 pt-3"
        />
      </header>

      {/* ── The six acts. All open. Always all six. ─────────────────────────── */}
      {ACTS.map((act, i) => (
        <ActSection
          key={act.key}
          id={`act-${act.key}`}
          index={i + 1}
          title={act.title}
          kicker={KICKERS[act.key]}
          Icon={act.Icon}
          hue={HUE}
          reduce={reduce}
          aside={asideFor[act.key] ?? null}
        >
          {bodyFor[act.key]}
        </ActSection>
      ))}

      {/* The disclaimer. The server's one sentence, verbatim, on screen as well as
          on all four print surfaces — the screen is where most readers meet it. */}
      {disclaimer ? (
        <p className="flex items-start gap-2 rounded-2xl border border-rule/60 bg-section px-4 py-3 text-[12px] leading-relaxed text-muted">
          <FileText size={14} className="mt-[2px] shrink-0" aria-hidden />
          <span>{disclaimer}</span>
        </p>
      ) : null}
    </div>
  )
}

export default function VisitPage() {
  return (
    <div className="min-h-screen">
      <BillingBanner />
      <VisitWorkspace />
    </div>
  )
}
