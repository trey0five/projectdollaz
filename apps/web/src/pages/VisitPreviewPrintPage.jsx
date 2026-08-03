// ─────────────────────────────────────────────────────────────────────────────
// AIC Phase H §4.2 — THE VISITING-TEAM PREVIEW (/accreditation/visit/print).
//
// The six acts of the Mock Visit, on paper. This is the document most likely to
// be handed to somebody who does accreditation for a living, which decides three
// things about it:
//
//   1. THE DISCLAIMER APPEARS TWICE — once above the fold and once in the footer.
//      It is the only surface in the product that says it twice, and that is
//      deliberate: a reader who starts on page one must not have to reach the
//      last page to learn that this is a self-assessment and not a submission.
//   2. EVERY FINDING PRINTS ITS FULL BASIS CHAIN — each row's `display` and its
//      `asOf`. On screen a basis deep-links; on paper it carries its value and
//      its date, and the absence of a link is not a missing basis.
//   3. ACT 5 PRINTS IN FULL — every named hole, every one of the roster's rows
//      with its own `unavailableReason` verbatim, and every rule that could not
//      be evaluated with the signal that blocked it. No truncation, no "show
//      more", no summary count standing in for the list (acceptance 6). A
//      readiness document that publishes only what it CAN see is the thing this
//      program exists to replace.
//
// The page composes NOTHING. Every sentence — narrative, caveat, rationale,
// consequence, `unavailableReason`, `message`, `copy` — arrives composed and is
// printed verbatim. No adopt control appears here; this is paper.
//
// Clones EvidenceIndexPrintPage structurally: inside AuthedLayout, `.no-print`
// toolbar, `.ui-v1` wrapper, one-shot auto `window.print()`, 402
// MODULE_NOT_LICENSED → module panel, plain 402 → `<EntitlementPausedPanel/>`.
// No motion anywhere (acceptance 5 — nothing to suppress).
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, BadgeCheck, Printer } from 'lucide-react'
import { useSchools } from '../context/SchoolContext.jsx'
import { accreditationApi, isModuleNotLicensed, isPaymentRequired } from '../lib/api.js'
import EntitlementPausedPanel from '../components/analytics/EntitlementPausedPanel.jsx'
import VisitPrintFooter from '../components/accreditation/print/VisitPrintFooter.jsx'
import { OWNER_ROLE_LABELS } from '../components/improvement/improvementMeta.js'
import { fmtDay } from '../components/accreditation/visitDates.js'

const ACCENT = '#F59E0B'

/** `number | null` on the act. Unreadable prints an em dash, never a zero. */
function pctOf(value) {
  return typeof value === 'number' && Number.isFinite(value) ? `${value}%` : '—'
}

/** The four roster partitions, in the order a reader cares about them. */
const PARTITIONS = [
  { key: 'available', label: 'Available' },
  { key: 'notLicensed', label: 'Not licensed' },
  { key: 'noData', label: 'No data' },
  { key: 'notTracked', label: 'Not tracked' },
]

function Act({ n, title, subtitle, children }) {
  return (
    <section className="mt-7 break-inside-avoid-page">
      <h2
        className="border-b-2 pb-1.5 font-serif text-[17px] font-semibold text-navy"
        style={{ borderColor: ACCENT }}
      >
        <span className="mr-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
          Act {n}
        </span>
        {title}
      </h2>
      {subtitle ? <p className="mt-1 text-[11.5px] text-muted">{subtitle}</p> : null}
      <div className="mt-2.5">{children}</div>
    </section>
  )
}

function Th({ children, wide }) {
  return (
    <th
      className={`border-b border-rule px-2 py-1.5 text-left align-bottom text-[9.5px] font-semibold uppercase tracking-[0.06em] text-muted ${
        wide ? '' : 'whitespace-nowrap'
      }`}
    >
      {children}
    </th>
  )
}

function Td({ children, className = '' }) {
  return (
    <td className={`border-b border-rule/50 px-2 py-1.5 align-top text-[11px] ${className}`}>
      {children}
    </td>
  )
}

/** One finding, with its whole basis chain printed as rows. */
function FindingBlock({ finding, code }) {
  const basis = finding.basis ?? finding.evidence ?? []
  return (
    <div className="mb-3 break-inside-avoid rounded-lg border border-rule/70 px-3 py-2.5">
      <p className="text-[12.5px] font-semibold text-navy">
        <span className="mr-1.5 rounded border border-rule px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
          {code ?? 'School-level'}
        </span>
        {finding.title}
        {finding.worked ? (
          <span className="ml-1.5 text-[10.5px] font-normal italic text-muted">
            already being worked
          </span>
        ) : null}
      </p>
      {finding.alsoServes?.length ? (
        <p className="mt-0.5 text-[10.5px] text-muted">
          Also serves {finding.alsoServes.join(', ')}
        </p>
      ) : null}
      {finding.rationale ? (
        <p className="mt-1 text-[11.5px] leading-snug text-muted">{finding.rationale}</p>
      ) : null}
      {finding.consequence ? (
        <p className="mt-1 text-[11.5px] leading-snug text-navy/80">{finding.consequence}</p>
      ) : null}
      {/* THE BASIS CHAIN. Every row, its rendered value and its date. A finding
          with no basis is a bug, not a finding — so the empty case says exactly
          that rather than printing a bare assertion. */}
      {basis.length === 0 ? (
        <p className="mt-1.5 text-[10.5px] font-semibold italic text-danger">
          No basis was recorded for this finding. Do not act on it — report it.
        </p>
      ) : (
        <table className="mt-1.5 w-full border-collapse">
          <tbody>
            {basis.map((b) => (
              <tr key={b.key}>
                <Td className="w-[45%] text-muted">{b.label}</Td>
                <Td className="w-[35%] font-semibold text-navy">{b.display}</Td>
                <Td className="whitespace-nowrap text-muted">{fmtDay(b.asOf)}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

export default function VisitPreviewPrintPage() {
  const { activeSchool } = useSchools()
  const schoolId = activeSchool?.id ?? null

  const [visit, setVisit] = useState(null)
  const [loading, setLoading] = useState(true)
  const [notLicensed, setNotLicensed] = useState(false)
  const [notEntitled, setNotEntitled] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    if (!schoolId) return undefined
    Promise.resolve().then(() => {
      if (cancelled) return
      setLoading(true)
      setError('')
      setNotLicensed(false)
      setNotEntitled(false)
      accreditationApi
        .getVisit(schoolId)
        .then((res) => {
          if (!cancelled) setVisit(res.data ?? null)
        })
        .catch((e) => {
          if (cancelled) return
          if (isModuleNotLicensed(e)) setNotLicensed(true)
          else if (isPaymentRequired(e)) setNotEntitled(true)
          else setError('Could not assemble the visiting-team preview.')
        })
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
    })
    return () => {
      cancelled = true
    }
  }, [schoolId])

  const ready = !loading && !!visit
  const disclaimer = typeof visit?.disclaimer === 'string' ? visit.disclaimer.trim() : ''

  const printed = useRef(false)
  useEffect(() => {
    if (!printed.current && ready && !!disclaimer && !notEntitled && !notLicensed) {
      printed.current = true
      const t = setTimeout(() => window.print(), 400)
      return () => clearTimeout(t)
    }
  }, [ready, disclaimer, notEntitled, notLicensed])

  if (notEntitled) {
    return (
      <div className="mx-auto max-w-[980px] px-4 py-8">
        <EntitlementPausedPanel />
      </div>
    )
  }

  if (notLicensed) {
    return (
      <div className="mx-auto max-w-[980px] px-4 py-8">
        <div className="card-soft flex flex-col items-center gap-3 px-6 py-14 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gold-gradient text-navy shadow-glow">
            <BadgeCheck size={26} />
          </span>
          <h2 className="font-serif text-xl font-semibold text-navy">
            Accreditation isn&apos;t on your plan yet
          </h2>
          <p className="max-w-md text-[15px] text-muted">
            Add the Accreditation module to produce the visiting-team preview.
          </p>
        </div>
      </div>
    )
  }

  const acts = visit?.acts ?? null
  const arrival = acts?.arrival ?? null
  const commendations = acts?.commendations ?? null
  const findingsAct = acts?.findings ?? null
  const requests = acts?.requests ?? null
  const unanswered = acts?.unanswered ?? null
  const planAct = acts?.plan ?? null

  const groups = findingsAct?.groups ?? []
  const schoolLevel = findingsAct?.schoolLevel ?? []
  const counts = findingsAct?.severityCounts ?? null
  const rows = unanswered?.signalRows ?? null
  const planItems = planAct?.items ?? []

  return (
    <div className="mx-auto max-w-[980px] px-4 py-8">
      <div className="no-print mb-6 flex items-center justify-between">
        <Link
          to="/accreditation/visit"
          className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-muted transition-colors hover:text-[#B45309]"
        >
          <ArrowLeft size={15} /> Back to the mock visit
        </Link>
        <button onClick={() => window.print()} className="btn-primary inline-flex items-center gap-2">
          <Printer size={15} /> Print / Save as PDF
        </button>
      </div>

      {error ? <p className="text-center text-[14px] text-danger">{error}</p> : null}

      {ready && !disclaimer ? (
        <p className="text-center text-[14px] text-danger">
          This preview could not be prepared: the readiness disclaimer was missing from the payload,
          and a readiness document is not published without it.
        </p>
      ) : null}

      {!ready ? (
        !error && <p className="text-center text-[14px] text-muted">Preparing the preview…</p>
      ) : !disclaimer ? null : (
        <div
          data-testid="visit-preview"
          className="ui-v1 rounded-xl border border-rule/60 bg-white p-8 print:rounded-none print:border-0 print:p-0"
        >
          {/* ── ACT 1 — the team is here (header) ──────────────────────────── */}
          <header className="border-b-4 pb-4" style={{ borderColor: ACCENT }}>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: ACCENT }}>
              Visiting-Team Preview
              {arrival?.frameworkLabel
                ? ` · ${arrival.frameworkLabel}`
                : visit.framework?.name
                  ? ` · ${visit.framework.name}`
                  : ''}
            </p>
            <h1 className="mt-1 font-serif text-[28px] font-semibold leading-tight text-navy">
              {activeSchool?.name ?? 'School'}
            </h1>
            <p className="mt-1 text-[12px] text-muted">
              What a visiting team would commend, likely find, and ask for — generated{' '}
              {fmtDay(visit.generatedAt)}
              {visit.demoData ? ' · demonstration data' : ''}
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <p className="text-[11.5px] text-muted">
                Documented{' '}
                <span className="font-semibold text-navy">{pctOf(arrival?.documented)}</span>
              </p>
              <p className="text-[11.5px] text-muted">
                Defensible{' '}
                <span className="font-semibold text-navy">{pctOf(arrival?.defensible)}</span>
              </p>
              <p className="text-[11.5px] text-muted">
                Projected index{' '}
                <span className="font-semibold text-navy">
                  {typeof arrival?.projectedIndex === 'number' ? arrival.projectedIndex : '—'}
                </span>
              </p>
              <p className="text-[11.5px] text-muted">
                Band <span className="font-semibold text-navy">{arrival?.band ?? '—'}</span>
              </p>
            </div>
            {arrival?.asOfLine ? (
              <p className="mt-2 text-[11.5px] leading-relaxed text-muted">{arrival.asOfLine}</p>
            ) : null}
            {arrival?.evaluableLine ? (
              <p className="mt-1 text-[11.5px] leading-relaxed text-muted">{arrival.evaluableLine}</p>
            ) : null}
            {arrival?.unavailableReason ? (
              <p className="mt-1 text-[11.5px] italic leading-relaxed text-muted">
                {arrival.unavailableReason}
              </p>
            ) : null}
            {/* THE HEADER DISCLAIMER — above the fold, in addition to the footer. */}
            <p
              data-testid="visit-preview-header-disclaimer"
              className="mt-3 rounded-lg border border-rule/70 bg-cream/60 px-3 py-2 text-[10.5px] leading-relaxed text-muted"
            >
              {visit.disclaimer}
            </p>
          </header>

          {/* ── ACT 2 — what they'd commend ────────────────────────────────── */}
          <Act
            n={2}
            title="What they'd commend"
            subtitle={commendations?.caveat ?? commendations?.unavailableReason ?? null}
          >
            {(commendations?.commendations ?? []).length === 0 ? (
              <p className="text-[12px] italic text-muted">
                No standard qualifies on all three tests today. That is a legitimate answer and it is
                not padded — the exclusion counts below say why.
              </p>
            ) : (
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <Th>Standard</Th>
                    <Th wide>What we can defend</Th>
                    <Th wide>Current evidence</Th>
                    <Th wide>Operating figures</Th>
                  </tr>
                </thead>
                <tbody>
                  {commendations.commendations.map((c) => (
                    <tr key={c.standardId} className="break-inside-avoid">
                      <Td className="whitespace-nowrap">
                        <span className="font-semibold text-navy">{c.code}</span>
                        {c.rubricLabel ? (
                          <p className="mt-0.5 text-[10px] text-muted">{c.rubricLabel}</p>
                        ) : null}
                      </Td>
                      <Td>
                        <span className="font-semibold text-navy">{c.title}</span>
                        {/* The engine's one deterministic sentence, verbatim. */}
                        {c.narrative ? (
                          <p className="mt-0.5 text-[10.5px] leading-snug text-muted">
                            {c.narrative}
                          </p>
                        ) : null}
                      </Td>
                      <Td>{(c.evidence ?? []).map((e) => e.label).join(', ') || '—'}</Td>
                      <Td>
                        {(c.signals ?? [])
                          .map((s) => `${s.label}${s.formattedValue ? ` ${s.formattedValue}` : ''}`)
                          .join(', ') || '—'}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {commendations?.exclusions ? (
              <p className="mt-2 text-[10.5px] leading-relaxed text-muted">
                Eligible {commendations.exclusions.eligible} · no self-score{' '}
                {commendations.exclusions.noScore} · self-score below the floor{' '}
                {commendations.exclusions.lowScore} · no artifact was ever asked for{' '}
                {commendations.exclusions.noRequirements} · no current evidence{' '}
                {commendations.exclusions.noCurrentEvidence} · no favorable operating figure{' '}
                {commendations.exclusions.noFavorableSignal}
              </p>
            ) : null}
          </Act>

          {/* ── ACT 3 — what they'd likely find, under named standard codes ── */}
          <Act
            n={3}
            title="What they'd likely find"
            subtitle={
              counts
                ? `${counts.total} finding${counts.total === 1 ? '' : 's'} — ${counts.critical} critical, ${counts.warn} warning, ${counts.info} informational. Each one prints the evidence it rests on.`
                : null
            }
          >
            {groups.length === 0 && schoolLevel.length === 0 ? (
              <p className="text-[12px] italic text-muted">
                No rule fired against today&apos;s evidence. Read that beside Act 5 — it is not the
                same as nothing to find.
              </p>
            ) : null}
            {groups.map((g) => (
              <div key={g.code} className="mt-3">
                <h3 className="text-[12px] font-semibold uppercase tracking-[0.08em] text-navy">
                  {g.code}
                </h3>
                <div className="mt-1.5">
                  {(g.findings ?? []).map((f) => (
                    <FindingBlock key={f.findingKey} finding={f} code={g.code} />
                  ))}
                </div>
              </div>
            ))}
            {schoolLevel.length ? (
              <div className="mt-3">
                <h3 className="text-[12px] font-semibold uppercase tracking-[0.08em] text-navy">
                  Not scoped to a standard
                </h3>
                {/* The composer's frozen sentence, printed verbatim. */}
                {findingsAct?.schoolLevelNote ? (
                  <p className="mt-0.5 text-[10.5px] italic leading-snug text-muted">
                    {findingsAct.schoolLevelNote}
                  </p>
                ) : null}
                <div className="mt-1.5">
                  {schoolLevel.map((f) => (
                    <FindingBlock key={f.findingKey} finding={f} code={null} />
                  ))}
                </div>
              </div>
            ) : null}
          </Act>

          {/* ── ACT 4 — what they'd ask for (pointer, not a reproduction) ──── */}
          <Act n={4} title="What they'd ask for">
            {requests?.unavailableReason ? (
              <p className="mb-1.5 text-[11.5px] italic leading-relaxed text-muted">
                {requests.unavailableReason}
              </p>
            ) : null}
            <p className="text-[12px] leading-relaxed text-muted">
              The full evidence index is its own document and is not reproduced here.
              {requests?.counts
                ? ` It covers ${requests.counts.artifacts ?? 0} required artifact${
                    (requests.counts.artifacts ?? 0) === 1 ? '' : 's'
                  }, ${requests.counts.artifactsTracked ?? 0} of them tracked in KYRO.`
                : ''}
            </p>
            {requests?.health?.basis ? (
              <p className="mt-1 text-[11.5px] leading-relaxed text-muted">
                {typeof requests.health.evidenceHealthPct === 'number' ? (
                  <span className="font-semibold text-navy">
                    {requests.health.evidenceHealthPct}% current
                  </span>
                ) : (
                  <span className="font-semibold text-navy">Not scored</span>
                )}{' '}
                — {requests.health.basis}
              </p>
            ) : null}
            <p className="mt-1.5 text-[11.5px] text-muted">
              Evidence Index:{' '}
              <span className="font-semibold text-navy">
                {requests?.indexRoute ?? '/accreditation/evidence/print'}
              </span>
            </p>
          </Act>

          {/* ── ACT 5 — what we could not answer. IN FULL. ─────────────────── */}
          <Act
            n={5}
            title="What we could not answer"
            subtitle="Published, not hidden. Every gap below is either a hole in what we can see or a module this school does not license — and each one names what would close it."
          >
            <div data-testid="visit-preview-unanswered">
              {/* 1. The named holes — the engine's own frozen copy, verbatim. */}
              <h3 className="text-[12px] font-semibold uppercase tracking-[0.08em] text-navy">
                Named holes ({(unanswered?.namedHoles ?? []).length})
              </h3>
              {(unanswered?.namedHoles ?? []).length === 0 ? (
                <p className="mt-1 text-[11.5px] italic text-muted">
                  No named hole is open for this framework.
                </p>
              ) : (
                <ul className="mt-1 space-y-1">
                  {unanswered.namedHoles.map((h) => (
                    <li key={h.ruleId} className="break-inside-avoid text-[11.5px] leading-snug">
                      <span className="font-semibold text-navy">{h.ruleId}</span>{' '}
                      <span className="text-muted">{h.copy}</span>
                      {h.intake ? (
                        <span className="text-muted"> Closed by: {h.intake}.</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}

              {/* 2. The signal roster — every row, its own reason, verbatim. */}
              <h3 className="mt-4 text-[12px] font-semibold uppercase tracking-[0.08em] text-navy">
                Every operating signal we tried to read
              </h3>
              {!rows ? (
                <p className="mt-1 text-[11.5px] italic text-muted">
                  The signal roster was not returned with this preview.
                </p>
              ) : (
                PARTITIONS.map(({ key, label }) => {
                  const part = rows[key] ?? []
                  return (
                    <div key={key} className="mt-2">
                      <p className="text-[11px] font-semibold text-navy">
                        {label} ({part.length})
                      </p>
                      {part.length === 0 ? (
                        <p className="text-[11px] italic text-muted">None.</p>
                      ) : (
                        <table className="mt-1 w-full border-collapse">
                          <tbody>
                            {part.map((s) => (
                              <tr key={s.key} className="break-inside-avoid">
                                <Td className="w-[32%]">
                                  <span className="font-semibold text-navy">{s.label}</span>
                                </Td>
                                <Td className="w-[16%] whitespace-nowrap text-muted">
                                  {s.observedOn ? fmtDay(s.observedOn) : '—'}
                                </Td>
                                {/* `reasonText`, NOT `unavailableReason`. The
                                    raw field is carried verbatim and may be
                                    null; `reasonText` is the composer's
                                    guarantee that a row which is not available
                                    always renders a reason — the collector's own
                                    words, or NO_REASON_GIVEN. Never blank. */}
                                <Td className="text-muted">{s.reasonText ?? ''}</Td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  )
                })
              )}

              {/* 3. The rules that could not run, each naming its blocking signal. */}
              <h3 className="mt-4 text-[12px] font-semibold uppercase tracking-[0.08em] text-navy">
                Rules we could not evaluate ({(unanswered?.rules ?? []).length})
              </h3>
              {(unanswered?.rules ?? []).length === 0 ? (
                <p className="mt-1 text-[11.5px] italic text-muted">
                  Every rule in the register could be evaluated.
                </p>
              ) : (
                <table className="mt-1 w-full border-collapse">
                  <thead>
                    <tr>
                      <Th wide>Rule</Th>
                      <Th wide>Blocked by</Th>
                      <Th wide>Why</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {unanswered.rules.map((r) => (
                      <tr key={r.ruleId} className="break-inside-avoid">
                        <Td>
                          <span className="font-semibold text-navy">{r.title}</span>
                        </Td>
                        <Td>{r.blockingSignalLabel ?? '—'}</Td>
                        <Td className="text-muted">{r.message}</Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {/* 4. The two asks the twin already computed — carried, never re-aggregated. */}
              {unanswered?.unlockableByYears?.signalKey &&
              (unanswered.unlockableByYears.fyLabels ?? []).length ? (
                <p className="mt-3 text-[11.5px] leading-relaxed text-muted">
                  {unanswered.unlockableByYears.ruleIds?.length ?? 0} rule
                  {(unanswered.unlockableByYears.ruleIds?.length ?? 0) === 1 ? '' : 's'} read{' '}
                  <span className="font-semibold text-navy">
                    {unanswered.unlockableByYears.signalKey}
                  </span>{' '}
                  and need {unanswered.unlockableByYears.fyLabels.join(', ')}.
                </p>
              ) : null}
              {(unanswered?.upsell ?? []).length ? (
                <p className="mt-1 text-[11.5px] leading-relaxed text-muted">
                  Blocked purely by licensing:{' '}
                  {unanswered.upsell
                    .map((u) => `${u.moduleKey} (${u.ruleIds?.length ?? 0})`)
                    .join(' · ')}
                  .
                </p>
              ) : null}
              {unanswered?.signalsUnavailable?.message ? (
                <p className="mt-1 text-[11.5px] italic leading-relaxed text-muted">
                  {unanswered.signalsUnavailable.message}
                </p>
              ) : null}
            </div>
          </Act>

          {/* ── ACT 6 — the plan, as a table. No adopt controls on paper. ──── */}
          <Act n={6} title="So here's the plan">
            {planItems.length === 0 ? (
              /* The composer's frozen sentence for THIS empty case, verbatim. */
              <p className="text-[12px] italic text-muted">
                {planAct?.unavailableReason ?? planAct?.emptyReason ?? ''}
              </p>
            ) : (
              <>
                <p className="mb-2 text-[11.5px] text-muted">
                  {planItems.length} proposed commitment{planItems.length === 1 ? '' : 's'}. Nothing
                  here is adopted until someone owns it.
                </p>
                <table className="w-full border-collapse">
                  <thead>
                    <tr>
                      <Th wide>What we would commit to</Th>
                      <Th wide>Suggested owner</Th>
                      <Th wide>Standards</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {planItems.map((item) => (
                      <tr key={item.originRef} className="break-inside-avoid">
                        <Td>
                          <span className="font-semibold text-navy">{item.title}</span>
                          {item.rationale ? (
                            <p className="mt-0.5 text-[10.5px] leading-snug text-muted">
                              {item.rationale}
                            </p>
                          ) : null}
                        </Td>
                        <Td className="whitespace-nowrap">
                          {item.suggestedOwnerRole
                            ? (OWNER_ROLE_LABELS[item.suggestedOwnerRole] ??
                              item.suggestedOwnerRole)
                            : '—'}
                        </Td>
                        <Td>{(item.standardTags ?? []).join(', ') || '—'}</Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {planAct?.moreAvailable > 0 ? (
                  <p className="mt-1.5 text-[11.5px] italic text-muted">
                    and {planAct.moreAvailable} more on the improvement plan.
                  </p>
                ) : null}
              </>
            )}
          </Act>

          <VisitPrintFooter
            disclaimer={visit.disclaimer}
            generatedAt={visit.generatedAt}
            demoData={visit.demoData}
            confidence={arrival?.confidence ?? null}
          />
        </div>
      )}
    </div>
  )
}
