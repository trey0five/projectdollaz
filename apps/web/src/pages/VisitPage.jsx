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
//
// AURORA (2026-10-15): the Accreditation band (school chip · "Mock visit" ·
// one plain sentence from the payload's own counts · the print documents and
// the narration control as the band's buttons · four glass figures), then the
// executive summary and the six acts as Aurora sections, each act's body in
// one white card. The long per-act explanations live in "How this works".
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useReducedMotion } from 'framer-motion'
import {
  Award,
  BadgeCheck,
  ClipboardList,
  FileText,
  Gauge,
  Landmark,
  Lightbulb,
  Pause,
  Play,
  Printer,
  ScanSearch,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import BillingBanner from '../components/BillingBanner.jsx'
import BackLink from '../components/ui/BackLink.jsx'
import { Pill } from '../components/ui/surface/index.js'
import {
  AuroraButton,
  AuroraCard,
  AuroraEmpty,
  AuroraHero,
  AuroraSection,
  HowThisWorks,
  VerdictEm,
} from '../components/ui/aurora/index.js'
import { moduleAccentVars } from '../components/module/moduleAnatomy.js'
import '../styles/pending/aurora-accred.css'
import ExecutiveSummary from '../components/accreditation/ExecutiveSummary.jsx'
import ActSection from '../components/accreditation/visit/ActSection.jsx'
import ActArrival, {
  BAND_QUALIFIER,
  BELOW_THRESHOLD_LABEL,
  projectedBandVerdict,
} from '../components/accreditation/visit/ActArrival.jsx'
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

// The page paints from the ONE module hue registry (the Accreditation hue):
// every Aurora section, tile and card under the band inherits --au-* from here.
const ACCENT = moduleAccentVars('accreditation')

/** The six acts, in the order a visiting team lives them. Frozen. */
const ACTS = [
  { key: 'arrival', title: 'The team is here', Icon: Landmark },
  { key: 'commendations', title: "What they'd commend", Icon: Award },
  { key: 'findings', title: "What they'd likely find", Icon: BadgeCheck },
  { key: 'requests', title: "What they'd ask for", Icon: ClipboardList },
  { key: 'unanswered', title: 'What we could not answer', Icon: ScanSearch },
  { key: 'plan', title: "So here's the plan", Icon: Lightbulb },
]

// ONE short line under each act's title. The longer standing explanation of
// each act (what it is, never about the school) moved to "How this works" at
// the foot of the page — the same sentences, one click away.
const KICKERS = {
  arrival: 'What a team sees on day one',
  commendations: 'Strengths you can prove three ways',
  findings: "Grouped under the standards they'd cite",
  requests: 'The proof a team will work from',
  unanswered: "What we couldn't check — and why",
  plan: 'Drafted from your gaps. Nothing saves until you confirm.',
}

const EXPLAIN = {
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

// ── The page shell for the states before there is a visit to show (gate,
// loading, unavailable): the same band with one plain sentence, then a
// designed empty state — one line and one way out.
function VisitState({ school, verdict, icon, text, sub = null, busy = false }) {
  return (
    <div className="au-scope mx-auto max-w-page px-4 pb-12 sm:px-10" style={ACCENT}>
      <BackLink fallback="/accreditation" fallbackLabel="Back to Accreditation" className="mt-4" />
      <AuroraHero
        moduleKey="accreditation"
        className="mt-3"
        school={school}
        eyebrow="Accreditation"
        title="Mock visit"
        verdict={verdict}
        actions={
          <AuroraButton variant="primary" to="/accreditation" icon={<BadgeCheck size={19} aria-hidden="true" />}>
            Open Accreditation
          </AuroraButton>
        }
      />
      <div className="mt-8" aria-busy={busy || undefined}>
        <AuroraEmpty icon={icon} text={text} sub={sub} />
      </div>
    </div>
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

  const schoolName = activeSchool?.name ?? null

  if (notLicensed || notEntitled) {
    return notLicensed ? (
      <VisitState
        school={schoolName}
        verdict="The mock visit rides on Accreditation."
        icon={BadgeCheck}
        text="Add the Accreditation module to rehearse the visit."
        sub="What a team would commend, what they would likely find, and what we cannot answer yet."
      />
    ) : (
      <VisitState
        school={schoolName}
        verdict="Your subscription is paused."
        icon={BadgeCheck}
        text="Resume your plan to run the mock visit."
      />
    )
  }

  if (loading && !visit) {
    return (
      <VisitState
        school={schoolName}
        verdict="Setting up the rehearsal…"
        icon={Landmark}
        text="Loading the mock visit…"
        busy
      />
    )
  }

  if (!visit) {
    return (
      <VisitState
        school={schoolName}
        verdict="The mock visit is unavailable right now."
        icon={Landmark}
        text={error || 'Reload to try again. Nothing about your register has changed.'}
      />
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
    findings: findings?.severityCounts ? <Pill variant="count">{findings.severityCounts.total} in all</Pill> : null,
    plan:
      typeof plan?.moreAvailable === 'number' && plan.moreAvailable > 0 ? (
        <Pill variant="count">top {plan.limit ?? planItems.length}</Pill>
      ) : null,
  }

  // ── The band: one plain sentence + the four headline figures ───────────────
  // Every figure is the payload's own (arrival / findings / commendations); the
  // judged pills are Likely findings (from the server's severities) and the
  // projected score (the framework's own bands, judged as /accreditation does). A figure the payload does not carry renders "—", never 0.
  const counts = findings?.severityCounts ?? null
  const strengths = Array.isArray(commendations?.commendations) ? commendations.commendations.length : null
  const findingTone = counts ? (counts.critical > 0 ? 'risk' : counts.warn > 0 ? 'watch' : null) : null
  const verdict = counts ? (
    counts.total > 0 ? (
      <>
        A visiting team would likely raise{' '}
        <VerdictEm tone={findingTone}>
          {counts.total} finding{counts.total === 1 ? '' : 's'}
        </VerdictEm>
        {counts.critical > 0 ? (
          <>
            , <VerdictEm tone="risk">{counts.critical} serious</VerdictEm>
          </>
        ) : null}
        .
        {strengths != null ? (
          strengths > 0 ? (
            <>
              {' '}
              You could defend{' '}
              <VerdictEm tone="good">
                {strengths} strength{strengths === 1 ? '' : 's'}
              </VerdictEm>
              .
            </>
          ) : (
            <> No strength clears the bar yet.</>
          )
        ) : null}
      </>
    ) : (
      <>A visiting team would raise nothing we could check on today&apos;s data.</>
    )
  ) : (
    <>Here is what a visiting team would see today.</>
  )
  // The jump bar's counts — lengths of what each act lists, never a new claim.
  const actCounts = {
    commendations: strengths,
    findings: counts ? counts.total : null,
    plan: planItems.length > 0 ? planItems.length : null,
  }
  const kpis = [
    {
      key: 'index',
      icon: Gauge,
      label: 'Projected score',
      value: arrival?.projectedIndex != null ? String(arrival.projectedIndex) : null,
      // Judged EXACTLY as the Accreditation band judges it (below every status
      // band → At risk, landed in one → Good; no band → no pill), with the same
      // short word in the pill. The server's band phrase moves to the caption,
      // still qualified as a projection (BAND_QUALIFIER) when it names a band.
      verdict: projectedBandVerdict(arrival?.band),
      caption:
        typeof arrival?.band === 'string' && arrival.band
          ? arrival.band === BELOW_THRESHOLD_LABEL
            ? arrival.band
            : `${BAND_QUALIFIER} · ${arrival.band}`
          : "On today's scores",
    },
    {
      key: 'defensible',
      icon: ShieldCheck,
      label: 'Backed by proof',
      value: arrival?.defensible != null ? String(arrival.defensible) : null,
      unit: '%',
      caption: arrival?.documented != null ? `Self-scored ${arrival.documented}%` : null,
    },
    {
      key: 'findings',
      icon: BadgeCheck,
      label: 'Likely findings',
      value: counts ? String(counts.total) : null,
      caption: counts ? `${counts.critical} serious · ${counts.warn} to watch` : null,
      verdict: findingTone,
    },
    {
      key: 'strengths',
      icon: Award,
      label: 'Strengths to commend',
      value: strengths != null ? String(strengths) : null,
      caption: 'Proven three ways',
    },
  ]

  return (
    <div className="au-scope mx-auto max-w-page px-4 pb-12 sm:px-10" style={ACCENT}>
      <BackLink fallback="/accreditation" fallbackLabel="Back to Accreditation" className="mt-4" />

      {/* ── The band ─────────────────────────────────────────────────────── */}
      <AuroraHero
        moduleKey="accreditation"
        className="mt-3"
        school={schoolName}
        eyebrow={['Accreditation', arrival?.asOfLine ? String(arrival.asOfLine).replace(/[.\s]+$/, '') : null]
          .filter(Boolean)
          .join(' · ')}
        title="Mock visit"
        verdict={verdict}
        actions={
          <>
            <AuroraButton variant="primary" to="/accreditation/visit/print" icon={<Printer size={19} aria-hidden="true" />}>
              Visiting-team preview
            </AuroraButton>
            <AuroraButton to="/accreditation/board/print" icon={<FileText size={19} aria-hidden="true" />}>
              Board one-pager
            </AuroraButton>
            {player.supported && summarySegments.length > 0 ? (
              <AuroraButton
                onClick={() => (player.playing ? player.pause() : player.play())}
                icon={player.playing ? <Pause size={19} aria-hidden="true" /> : <Play size={19} aria-hidden="true" />}
              >
                {player.playing ? 'Pause' : 'Read it to me'}
              </AuroraButton>
            ) : null}
          </>
        }
        kpis={kpis}
      />

      {error ? (
        <AuroraCard tone="risk" className="mt-6">
          <p className="text-small font-semibold text-risk">{error}</p>
        </AuroraCard>
      ) : null}

      {/* ── Jump to an act — six acts run long, so the reader can go straight
          to the one they need (each act keeps every row; nothing is hidden). */}
      <nav aria-label="Jump to an act" className="acc-actnav" data-testid="act-jump-bar">
        {ACTS.map((act, i) => {
          const n = actCounts[act.key]
          return (
            <a
              key={act.key}
              href={`#act-${act.key}`}
              className="acc-actnav-link"
              onClick={(e) => {
                const el = document.getElementById(`act-${act.key}`)
                if (!el) return
                e.preventDefault()
                el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
              }}
            >
              <span className="acc-actnav-num" aria-hidden="true">
                {i + 1}
              </span>
              {act.title}
              {n != null ? <span className="acc-actnav-count">{n}</span> : null}
            </a>
          )
        })}
      </nav>

      {/* ── The executive summary, printed and speakable ─────────────────── */}
      <AuroraSection first icon={Sparkles} title="In short" subtitle="A rehearsal, not a verdict">
        <AuroraCard>
          <ExecutiveSummary segments={summarySegments} />
        </AuroraCard>
      </AuroraSection>

      {/* ── The six acts. All open. Always all six. ─────────────────────────── */}
      {ACTS.map((act, i) => (
        <ActSection
          key={act.key}
          id={`act-${act.key}`}
          index={i + 1}
          title={act.title}
          kicker={KICKERS[act.key]}
          Icon={act.Icon}
          reduce={reduce}
          aside={asideFor[act.key] ?? null}
        >
          {bodyFor[act.key]}
        </ActSection>
      ))}

      {/* The disclaimer. The server's one sentence, verbatim, on screen as well as
          on all four print surfaces — the screen is where most readers meet it. */}
      {disclaimer ? (
        <p className="sec-note mt-10 flex items-start gap-2 border-t border-hair pt-3">
          <FileText size={13} className="mt-[2px] shrink-0" aria-hidden />
          <span>{disclaimer}</span>
        </p>
      ) : null}

      <HowThisWorks className="!mt-4">
        {ACTS.map((act, i) => (
          <p key={act.key}>
            <b>
              Act {i + 1} · {act.title}.
            </b>{' '}
            {EXPLAIN[act.key]}
          </p>
        ))}
      </HowThisWorks>
    </div>
  )
}

export default function VisitPage() {
  return (
    <div className="acc-hue min-h-screen">
      <BillingBanner />
      <VisitWorkspace />
    </div>
  )
}
