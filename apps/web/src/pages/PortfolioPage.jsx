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
import { Building2, Layers, ShieldAlert } from 'lucide-react'
import { PageHeader, Button } from '../components/ui/surface/index.js'
import '../styles/pending/b1-domain.css'
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

/** The org-scope gate. A dead end would be a bug; this is the way in. */
function ScopeGate({ hasOrg, onSwitch }) {
  return (
    <div className="mx-auto max-w-page px-4 py-6 sm:px-10 sm:py-8">
      <BackLink />
      <PageHeader
        eyebrow="Portfolio · Organization"
        title="The portfolio is an organization view"
        meta={
          hasOrg
            ? 'It ranks every school in your organization side by side, so it only means anything at organization scope.'
            : 'This account is not part of a multi-school organization, so there is no portfolio to rank.'
        }
        actions={
          hasOrg ? (
            <Button variant="primary" onClick={onSwitch} icon={<Building2 size={16} aria-hidden />}>
              Switch to organization
            </Button>
          ) : null
        }
      />
    </div>
  )
}

// ── The workspace ────────────────────────────────────────────────────────────
function PortfolioWorkspace({ orgId, orgName, orgSchoolCount }) {
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

  const meta = [
    Number.isFinite(portfolio?.rankedCount) && Number.isFinite(portfolio?.schoolCount)
      ? `${portfolio.rankedCount} of ${portfolio.schoolCount} schools ranked`
      : `${orgSchoolCount} schools`,
    portfolio?.asOf ? `as of ${portfolio.asOf}` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <div className="mx-auto max-w-page px-4 py-6 sm:px-10 sm:py-8">
      <BackLink />

      {/* Header — the organization, the count, the owner-only preview lens */}
      <PageHeader
        eyebrow="Portfolio · Accreditation across the organization"
        title={
          <span className="inline-flex items-center gap-3">
            <Layers size={26} strokeWidth={1.75} className="shrink-0 text-navy-soft" aria-hidden="true" />
            {orgName || 'Organization'}
          </span>
        }
        meta={meta}
        actions={
          lens ? (
            <>
              <LensIndicator lens={lens} />
              <LensSwitcher lens={lens} callerRole={callerRole} availableLenses={availableLenses} onChange={setPreviewLens} />
            </>
          ) : null
        }
      />

      {/* The server's NOTES — including the mixed-framework sentence. A note that
          only exists in JSON has not been delivered (spec §7.2). */}
      {notes.length > 0 && (
        <ul className="mt-6 space-y-1.5 border-l-2 pl-4" style={{ borderLeftColor: 'rgb(var(--c-watch))' }}>
          {notes.map((n, i) => (
            <li key={i} className="max-w-prose text-[13.5px] leading-relaxed text-ink">
              {n}
            </li>
          ))}
        </ul>
      )}

      {/* The disclaimer is a first-class PAYLOAD FIELD, printed verbatim — not UI
          chrome this page composed (the Phase-H rule). */}
      {portfolio?.disclaimer && (
        <p className="mt-6 flex max-w-prose items-start gap-2.5 text-[13px] leading-relaxed text-ink2">
          <ShieldAlert size={16} aria-hidden className="mt-0.5 shrink-0 text-ink2" />
          {portfolio.disclaimer}
        </p>
      )}

      <div className="mt-8">
      {/* Ranked */}
      {portfolioLoading ? (
        <div className="b1-empty">
          <p>Assembling the portfolio…</p>
        </div>
      ) : portfolioError ? (
        <div className="b1-empty" role="alert">
          <p>{portfolioError}</p>
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
      </div>

      {portfolio?.generatedAt && Number.isFinite(new Date(portfolio.generatedAt).getTime()) && (
        <p className="mt-8 text-[11.5px] text-ink2">
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
        <PageHeader eyebrow="Portfolio · Organization" title="Portfolio" meta="Resolving your organization…" />
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
