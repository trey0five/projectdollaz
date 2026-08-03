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
import { motion, useReducedMotion } from 'framer-motion'
import { Building2, Layers, ShieldAlert } from 'lucide-react'
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

function CenteredPanel({ children }) {
  return (
    <div className="mx-auto max-w-page space-y-4 px-4 py-6 sm:px-10 sm:py-8">
      <BackLink />
      <div className="card-soft flex flex-col items-center gap-3 px-6 py-14 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gold-gradient text-white shadow-glow">
          <Layers size={26} />
        </span>
        {children}
      </div>
    </div>
  )
}

/** The org-scope gate. A dead end would be a bug; this is the way in. */
function ScopeGate({ hasOrg, onSwitch }) {
  return (
    <CenteredPanel>
      <h2 className="font-serif text-xl font-semibold text-navy">
        The portfolio is an organization view
      </h2>
      {hasOrg ? (
        <>
          <p className="max-w-md text-[15px] text-muted">
            It ranks every school in your organization side by side, so it only means anything at
            organization scope.
          </p>
          <button
            type="button"
            onClick={onSwitch}
            className="mt-1 inline-flex min-h-[42px] items-center gap-2 rounded-lg bg-gold-gradient px-4 text-[14px] font-semibold text-white shadow-glow"
          >
            <Building2 size={16} aria-hidden />
            Switch to organization
          </button>
        </>
      ) : (
        <p className="max-w-md text-[15px] text-muted">
          This account is not part of a multi-school organization, so there is no portfolio to rank.
        </p>
      )}
    </CenteredPanel>
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

  return (
    <div className="mx-auto max-w-page space-y-5 px-4 py-6 sm:space-y-7 sm:px-10 sm:py-8">
      <BackLink />

      {/* Hero */}
      <motion.div
        initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="card-soft flex flex-col gap-3 px-5 py-5 sm:flex-row sm:items-center sm:gap-5 sm:px-7 sm:py-6"
      >
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gold-gradient text-white shadow-glow">
          <Layers size={24} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-gold">
            Organization · accreditation portfolio
          </p>
          <h1 className="truncate py-0.5 font-serif text-2xl font-semibold leading-[1.35] text-navy sm:text-[28px]">
            {orgName || 'Organization'}
          </h1>
          <p className="text-[13px] text-muted">
            {Number.isFinite(portfolio?.rankedCount) && Number.isFinite(portfolio?.schoolCount)
              ? `${portfolio.rankedCount} of ${portfolio.schoolCount} schools ranked`
              : `${orgSchoolCount} schools`}
            {portfolio?.asOf ? ` · as of ${portfolio.asOf}` : ''}
          </p>
        </div>
        {lens && (
          <div className="flex shrink-0 flex-wrap items-center gap-3">
            <LensIndicator lens={lens} />
            <LensSwitcher
              lens={lens}
              callerRole={callerRole}
              availableLenses={availableLenses}
              onChange={setPreviewLens}
            />
          </div>
        )}
      </motion.div>

      {/* The server's NOTES — including the mixed-framework sentence. A note that
          only exists in JSON has not been delivered (spec §7.2). */}
      {notes.length > 0 && (
        <div className="card-soft border-l-4 border-gold bg-gold/[0.06] px-5 py-4">
          <ul className="space-y-1.5">
            {notes.map((n, i) => (
              <li key={i} className="text-[13.5px] leading-relaxed text-navy">
                {n}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* The disclaimer is a first-class PAYLOAD FIELD, printed verbatim — not UI
          chrome this page composed (the Phase-H rule). */}
      {portfolio?.disclaimer && (
        <div className="card-soft flex items-start gap-3 border-l-4 border-gold bg-gold/[0.04] px-5 py-4">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gold/15 text-gold">
            <ShieldAlert size={17} aria-hidden />
          </span>
          <p className="text-[13.5px] leading-relaxed text-muted">{portfolio.disclaimer}</p>
        </div>
      )}

      {/* Ranked */}
      {portfolioLoading ? (
        <div className="card-soft animate-pulse px-6 py-14 text-center">
          <p className="font-serif text-base italic text-muted">Assembling the portfolio…</p>
        </div>
      ) : portfolioError ? (
        <div className="card-soft border-dashed px-6 py-12 text-center">
          <p className="font-serif text-base italic text-muted">{portfolioError}</p>
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

      {portfolio?.engineVersion && (
        <p className="text-[11.5px] text-muted">
          Portfolio engine {portfolio.engineVersion}
          {portfolio?.generatedAt ? ` · generated ${portfolio.generatedAt}` : ''}
        </p>
      )}
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
    return (
      <div className="mx-auto max-w-page px-4 py-6 sm:px-10 sm:py-8">
        <div className="card-soft animate-pulse px-6 py-14 text-center">
          <p className="font-serif text-base italic text-muted">Resolving your organization…</p>
        </div>
      </div>
    )
  }

  if (!hasOrg || scope !== 'org') {
    return <ScopeGate hasOrg={hasOrg} onSwitch={() => setScope('org')} />
  }

  return (
    <PortfolioWorkspace orgId={orgId} orgName={orgName} orgSchoolCount={orgSchoolCount} />
  )
}
