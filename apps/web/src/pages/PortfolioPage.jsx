// ─────────────────────────────────────────────────────────────────────────────
// /portfolio — THE SUPERINTENDENT PORTFOLIO (AIC Phase I).
//
// One page that answers four questions for a whole diocese: which schools need
// attention AND WHY IN WORDS, which schools we cannot honestly rank AND WHAT IS
// MISSING, which single standard is weak at enough schools to justify one
// diocesan intervention instead of nine school projects, and whether the
// improvement work already adopted is actually moving.
//
// ORG SCOPE ONLY. This is a cross-school view, so it renders at organization
// scope and offers the switch (rather than a dead end) at school scope — the same
// behaviour the other org rollups have.
//
// THREE READS, NO FAN-OUT. The page issues exactly three GETs regardless of how
// many schools the diocese has; every heavy aggregation is server-side and
// bounded (the whole point of the phase). It NEVER loops schools to fetch
// anything, and it must not grow a per-school call — a 40-school diocese doing
// that is the connection-pool exhaustion this phase exists to remove.
//
// THE PAGE COMPUTES NOTHING IT RENDERS. The ranking, the ordering, the drivers,
// the notes, the headline sentences and the disclaimer all arrive composed. The
// only client-side derivation in this file is the `schoolIds` for a bulk adopt —
// and that is a SELECTION of rows the server already flagged below threshold,
// stated in the button's own copy, never a new number.
//
// FAIL-SOFT, PER SECTION. Each of the three reads owns its own error state, so a
// failing velocity read never blanks the portfolio, and a 402/403 renders a
// panel that says which thing is unavailable — never a white screen.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useReducedMotion } from 'framer-motion'
import { Activity, AlertTriangle, Building2, HelpCircle, Layers, ListOrdered, ShieldAlert, Target } from 'lucide-react'
import '../styles/pending/b1-domain.css'
import '../styles/pending/aurora-accred.css'
import {
  AuroraButton,
  AuroraEmpty,
  AuroraHero,
  AuroraSection,
  HowThisWorks,
  VerdictEm,
} from '../components/ui/aurora/index.js'
import { moduleAccentVars } from '../components/module/moduleAnatomy.js'
import { bandTone } from '../components/portfolio/AttentionBandChip.jsx'
import BackLink from '../components/ui/BackLink.jsx'
import { LensIndicator, LensSwitcher } from '../components/home/LensControls.jsx'
import PortfolioTable from '../components/portfolio/PortfolioTable.jsx'
import UnrankedPanel from '../components/portfolio/UnrankedPanel.jsx'
import InterventionPriorities from '../components/portfolio/InterventionPriorities.jsx'
import VelocityPanel from '../components/portfolio/VelocityPanel.jsx'
import { useScope } from '../context/ScopeContext.jsx'
import { portfolioApi } from '../lib/api.js'

/** The DTO's ArrayMaxSize on `schoolIds` (spec §4.6) — stated, not guessed at. */
const BULK_ADOPT_MAX_SCHOOLS = 60

// The portfolio is accreditation across the organization, so it wears the
// Accreditation hue from the ONE registry (never a second palette).
const ACCENT = moduleAccentVars('accreditation')

/** The band + one designed empty state, for the screens before the portfolio. */
function PortfolioState({ school = null, verdict, icon, text, sub = null, action = null, busy = false }) {
  return (
    <div className="acc-hue au-scope mx-auto max-w-page px-4 py-6 sm:px-10 sm:py-8" style={ACCENT}>
      <BackLink />
      <AuroraHero
        moduleKey="accreditation"
        className="mt-3"
        school={school}
        eyebrow="Accreditation across the organization"
        title="Portfolio"
        verdict={verdict}
        actions={action}
        monogram={school ? undefined : false}
      />
      <div className="mt-8" aria-busy={busy || undefined}>
        <AuroraEmpty icon={icon} text={text} sub={sub} />
      </div>
    </div>
  )
}

/** The org-scope gate. A dead end would be a bug; this is the way in. */
function ScopeGate({ hasOrg, onSwitch }) {
  return (
    <PortfolioState
      verdict={hasOrg ? 'The portfolio is an organization view.' : 'There is no organization to rank.'}
      icon={Layers}
      text={
        hasOrg
          ? 'It ranks every school in your organization side by side.'
          : 'This account is not part of a multi-school organization.'
      }
      action={
        hasOrg ? (
          <AuroraButton variant="primary" onClick={onSwitch} icon={<Building2 size={19} aria-hidden="true" />}>
            Switch to organization
          </AuroraButton>
        ) : null
      }
    />
  )
}

// ── The workspace ────────────────────────────────────────────────────────────
function PortfolioWorkspace({ orgId, orgName, orgSchoolCount }) {
  const reduce = useReducedMotion()
  // Owner-only "preview as" lens, exactly like the org briefing: the org routes
  // are JwtAuth-only and the SERVER clamps, so this can never widen access.
  const [previewLens, setPreviewLens] = useState(null)

  const [portfolio, setPortfolio] = useState(null)
  const [portfolioError, setPortfolioError] = useState('')
  const [portfolioLoading, setPortfolioLoading] = useState(true)

  const [standards, setStandards] = useState(null)
  const [standardsError, setStandardsError] = useState('')
  const [standardsLoading, setStandardsLoading] = useState(true)

  const [velocity, setVelocity] = useState(null)
  const [velocityError, setVelocityError] = useState('')
  const [velocityLoading, setVelocityLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    if (!orgId) return undefined
    const opts = previewLens ? { lens: previewLens } : {}

    // MICROTASK DEFER — the house pattern (useVisit, ScopeContext). Setting state
    // synchronously in an effect body cascades renders, and the three reads below
    // are all "external system" work that belongs off the render path.
    Promise.resolve().then(() => {
      if (cancelled) return
      setPortfolioLoading(true)
      setStandardsLoading(true)
      setVelocityLoading(true)

      // Three independent reads, settled independently: one failing section must
      // never take the other two off the screen.
      portfolioApi
        .get(orgId, opts)
        .then((res) => {
          if (cancelled) return
          setPortfolio(res.data ?? null)
          setPortfolioError('')
        })
        .catch((e) => {
          if (cancelled) return
          setPortfolio(null)
          setPortfolioError(readError(e) ?? 'The portfolio is unavailable right now.')
        })
        .finally(() => {
          if (!cancelled) setPortfolioLoading(false)
        })

      portfolioApi
        .standards(orgId, opts)
        .then((res) => {
          if (cancelled) return
          setStandards(res.data ?? null)
          setStandardsError('')
        })
        .catch((e) => {
          if (cancelled) return
          setStandards(null)
          setStandardsError(readError(e) ?? 'Intervention priorities are unavailable right now.')
        })
        .finally(() => {
          if (!cancelled) setStandardsLoading(false)
        })

      portfolioApi
        .velocity(orgId, opts)
        .then((res) => {
          if (cancelled) return
          setVelocity(res.data ?? null)
          setVelocityError('')
        })
        .catch((e) => {
          if (cancelled) return
          setVelocity(null)
          setVelocityError(readError(e) ?? 'Improvement velocity is unavailable right now.')
        })
        .finally(() => {
          if (!cancelled) setVelocityLoading(false)
        })
    })

    return () => {
      cancelled = true
    }
  }, [orgId, previewLens])

  const lens = portfolio?.lens ?? null
  const callerRole = portfolio?.callerRole ?? null
  const availableLenses = useMemo(
    () => (Array.isArray(portfolio?.availableLenses) ? portfolio.availableLenses : []),
    [portfolio],
  )
  // A viewer never writes, and the write route additionally requires owner /
  // accountant AT EVERY TARGET SCHOOL — which only the server can check, and does
  // (403 naming the school). This flag decides whether we OFFER the control.
  const canWrite = lens !== 'viewer' && (callerRole === 'owner' || callerRole === 'accountant')

  // The schools a bulk adopt targets: the ones the server itself scored at or
  // below the threshold. Unscored schools are deliberately NOT included — "we
  // have no score" is not "this school is weak", and adopting an initiative on a
  // school we cannot see is the same category error as ranking one.
  const targetsFor = useCallback(
    (priority) => {
      const threshold = Number.isFinite(standards?.thresholdScore) ? standards.thresholdScore : 2
      const rows = Array.isArray(priority?.schools) ? priority.schools : []
      return rows
        .filter((s) => Number.isFinite(s?.rubricScore) && s.rubricScore <= threshold)
        .map((s) => s?.schoolId)
        .filter(Boolean)
    },
    [standards],
  )

  const bulkBody = useCallback(
    (priority, body, mode) => {
      const schoolIds = targetsFor(priority)
      if (schoolIds.length === 0) {
        throw new Error('No school in this priority carries a score at or below the threshold.')
      }
      if (schoolIds.length > BULK_ADOPT_MAX_SCHOOLS) {
        throw new Error(
          `This priority covers ${schoolIds.length} schools; a single adoption is limited to ${BULK_ADOPT_MAX_SCHOOLS}.`,
        )
      }
      return {
        mode,
        catalogStandardId: priority?.catalogStandardId,
        schoolIds,
        title: body?.title,
        ...(body?.dueDate ? { dueDate: body.dueDate } : {}),
      }
    },
    [targetsFor],
  )

  const onPropose = useCallback(
    async (priority, body) => {
      const res = await portfolioApi.bulkAdopt(orgId, bulkBody(priority, body, 'propose'))
      return res.data
    },
    [orgId, bulkBody],
  )

  const onConfirm = useCallback(
    async (priority, body) => {
      const res = await portfolioApi.bulkAdopt(orgId, {
        ...bulkBody(priority, body, 'confirm'),
        proposalHash: body?.proposalHash,
      })
      return res.data
    },
    [orgId, bulkBody],
  )

  const notes = Array.isArray(portfolio?.notes) ? portfolio.notes : []

  // ── The band: one sentence + four figures, every one the server's ──────────
  // `needAttention` is a COUNT of rows the server itself banded high/critical
  // (bandTone), never a new judgement; unranked schools are never counted as
  // either healthy or weak.
  const ranked = Array.isArray(portfolio?.ranked) ? portfolio.ranked : []
  const insufficient = Array.isArray(portfolio?.insufficientData) ? portfolio.insufficientData : []
  const needAttention = ranked.filter((r) => bandTone(r?.attentionBand) === 'risk').length
  const rankedCount = Number.isFinite(portfolio?.rankedCount) ? portfolio.rankedCount : ranked.length
  const schoolCount = Number.isFinite(portfolio?.schoolCount) ? portfolio.schoolCount : orgSchoolCount
  const totalPriorities = Number.isFinite(standards?.totalPriorities) ? standards.totalPriorities : null
  const threshold = Number.isFinite(standards?.thresholdScore) ? standards.thresholdScore : null

  const verdict = portfolioLoading ? (
    <>Assembling the portfolio…</>
  ) : portfolioError || !portfolio ? (
    <>The portfolio is unavailable right now.</>
  ) : rankedCount === 0 ? (
    <>
      No school has enough data to rank yet.
      {insufficient.length > 0 ? (
        <>
          {' '}
          <VerdictEm tone="watch">
            {insufficient.length} school{insufficient.length === 1 ? ' is' : 's are'}
          </VerdictEm>{' '}
          missing data.
        </>
      ) : null}
    </>
  ) : (
    <>
      {needAttention > 0 ? (
        <>
          <VerdictEm tone="risk">
            {needAttention} of {rankedCount} ranked school{rankedCount === 1 ? '' : 's'}
          </VerdictEm>{' '}
          need{needAttention === 1 ? 's' : ''} attention.
        </>
      ) : (
        <>
          None of the <VerdictEm>{rankedCount} ranked</VerdictEm> school{rankedCount === 1 ? ' is' : 's is'} in a high band.
        </>
      )}
      {insufficient.length > 0 ? (
        <>
          {' '}
          <VerdictEm tone="watch">{insufficient.length} more</VerdictEm> can&apos;t be ranked yet.
        </>
      ) : null}
    </>
  )

  const kpis = [
    {
      key: 'ranked',
      icon: ListOrdered,
      label: 'Ranked',
      value: portfolio ? String(rankedCount) : null,
      unit: portfolio && Number.isFinite(schoolCount) ? `of ${schoolCount}` : null,
      caption: 'Schools with enough data',
    },
    {
      key: 'attention',
      icon: AlertTriangle,
      label: 'Need attention',
      value: portfolio ? String(needAttention) : null,
      caption: 'High or critical band',
      verdict: !portfolio || rankedCount === 0 ? null : needAttention > 0 ? 'risk' : 'good',
    },
    {
      key: 'unranked',
      icon: HelpCircle,
      label: "Can't rank yet",
      value: portfolio ? String(insufficient.length) : null,
      caption: 'Missing data, named below',
    },
    {
      key: 'shared',
      icon: Target,
      label: 'Shared weak standards',
      value: totalPriorities != null ? String(totalPriorities) : null,
      caption: threshold != null ? `Self-scored ${threshold} or under` : null,
    },
  ]

  // Honour reduced motion, like the Accreditation page's openJourney. Both
  // targets carry their id in every state (loading, error, loaded).
  const scrollTo = (id) =>
    document.getElementById(id)?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })

  return (
    <div className="acc-hue au-scope mx-auto max-w-page px-4 py-6 sm:px-10 sm:py-8" style={ACCENT}>
      <BackLink />

      {/* ── The band — the organization, one sentence, the figures; the
          owner-only "preview as" lens rides in the tools row. ─────────────── */}
      <AuroraHero
        moduleKey="accreditation"
        className="mt-3"
        school={orgName || 'Organization'}
        eyebrow={['Accreditation across the organization', portfolio?.asOf ? `as of ${portfolio.asOf}` : null]
          .filter(Boolean)
          .join(' · ')}
        title="Portfolio"
        verdict={verdict}
        actions={
          <>
            <AuroraButton variant="primary" onClick={() => scrollTo('priorities')} icon={<Target size={19} aria-hidden="true" />}>
              Shared weak standards
            </AuroraButton>
            <AuroraButton onClick={() => scrollTo('velocity')} icon={<Activity size={19} aria-hidden="true" />}>
              Is the work moving?
            </AuroraButton>
          </>
        }
        tools={
          lens ? (
            <>
              <LensIndicator lens={lens} />
              <LensSwitcher lens={lens} callerRole={callerRole} availableLenses={availableLenses} onChange={setPreviewLens} />
            </>
          ) : null
        }
        kpis={kpis}
      />

      {/* Ranked + not ranked */}
      {portfolioLoading ? (
        <div className="mt-10">
          <AuroraEmpty icon={ListOrdered} text="Assembling the portfolio…" aria-busy="true" />
        </div>
      ) : portfolioError ? (
        <div className="mt-10" role="alert">
          <AuroraEmpty icon={ListOrdered} text={portfolioError} />
        </div>
      ) : (
        <>
          <PortfolioTable
            rows={portfolio?.ranked ?? []}
            indexComparable={portfolio?.indexComparable !== false}
          />
          <UnrankedPanel
            insufficientData={portfolio?.insufficientData ?? []}
            notLicensed={portfolio?.notLicensed ?? []}
          />
        </>
      )}

      <InterventionPriorities
        data={standards}
        loading={standardsLoading}
        error={standardsError}
        canWrite={canWrite}
        onPropose={onPropose}
        onConfirm={onConfirm}
      />

      <VelocityPanel data={velocity} loading={velocityLoading} error={velocityError} />

      {/* The disclaimer is a first-class PAYLOAD FIELD, printed verbatim — not UI
          chrome this page composed (the Phase-H rule). */}
      {portfolio?.disclaimer && (
        <p className="mt-10 flex max-w-prose items-start gap-2.5 border-t border-hair pt-3 text-[12.5px] leading-relaxed text-ink2">
          <ShieldAlert size={15} aria-hidden className="mt-0.5 shrink-0 text-ink2" />
          {portfolio.disclaimer}
        </p>
      )}

      {portfolio?.generatedAt && Number.isFinite(new Date(portfolio.generatedAt).getTime()) && (
        <p className="mt-2 text-[11.5px] text-ink2">
          Updated{' '}
          {new Date(portfolio.generatedAt).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            // UTC, so the date agrees with the server's "as of" in the header.
            timeZone: 'UTC',
          })}
        </p>
      )}

      <HowThisWorks className="!mt-4">
        {/* The server's NOTES (including the mixed-framework sentence), word for
            word. They are context for the numbers, not a decision, so they sit
            here rather than above the ranking — still delivered, every one
            (spec §7.2), and the ranked strip's own subtitle already says when
            index scores are not compared across frameworks. */}
        {notes.length > 0 ? (
          <ul className="pf-notes" data-testid="portfolio-notes">
            {notes.map((n, i) => (
              <li key={i}>
                <p>{n}</p>
              </li>
            ))}
          </ul>
        ) : null}
        <p>
          Schools are ordered by the server: attention band first, then urgency, then the attention score, then
          evidence-backed coverage. Index scores are never compared across different frameworks.
        </p>
        <p>
          A school missing too much data is not ranked at all — not at the bottom, off the list — with what is
          missing named. Fill the gap and it ranks on the next refresh.
        </p>
        <p>
          Shared weak standards are grouped by the shared catalog standard, never by a code a school can edit.
        </p>
      </HowThisWorks>
    </div>
  )
}

function readError(e) {
  const msg = e?.response?.data?.message
  if (typeof msg === 'string') return msg
  if (Array.isArray(msg) && typeof msg[0] === 'string') return msg[0]
  return null
}

export default function PortfolioPage() {
  const { scope, setScope, hasOrg, orgId, orgName, orgSchoolCount, orgResolved } = useScope()

  // Never act on a not-yet-resolved org — the mount-gate gotcha that has bitten
  // every org surface in this app.
  if (!orgResolved) {
    return <PortfolioState verdict="Resolving your organization…" icon={Layers} text="Finding your schools…" busy />
  }

  if (!hasOrg || scope !== 'org') {
    return <ScopeGate hasOrg={hasOrg} onSwitch={() => setScope('org')} />
  }

  return (
    <PortfolioWorkspace orgId={orgId} orgName={orgName} orgSchoolCount={orgSchoolCount} />
  )
}
