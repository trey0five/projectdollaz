// ─────────────────────────────────────────────────────────────────────────────
// AIC Phase C — the EVIDENCE INDEX print route (/accreditation/evidence/print).
//
// This is the one document a school actually hands a visiting team, and the whole
// program is judged on whether it survives being read by someone who does this for
// a living. So it is a single table with seven columns and no rhetoric:
//
//   Artifact · Exists · Dated · Current · Where it lives · Standards it serves ·
//   Also in portal
//
// Every cell is a fact off the server payload. There is no client-side date math,
// no derived state and no sentence composed here — `health.basis`, each group's
// `message`, the not-tracked wording and the confidence caveat all arrive
// computed, and are printed verbatim.
//
// THE THREE THINGS THAT MUST BE TRUE OF THIS PAGE ON PAPER:
//   · `alsoInPortal === null` prints "—", NEVER "No". A school that has not told
//     us whether an artifact is also in their accreditor's portal has not told us
//     anything, and printing "No" would put a claim in their hands that they never
//     made — in front of the one audience that would act on it.
//   · A `not_tracked` row prints in full, says "Not tracked in KYRO" under "Where
//     it lives", and is excluded from the health figure in the footer. The hole is
//     published, not hidden, and the school is not scored down for it.
//   · The footer disclaimer is NOT `no-print`. A KYRO self-assessment leaving the
//     building without the line that says it is not an accreditation product is
//     the exact misreading this program exists to prevent.
//
// Clones GovernanceReportPrintPage exactly: inside AuthedLayout (SchoolProvider is
// available; the AppShell chrome is `.no-print` and the sidebar offset is
// neutralized by the global print reset), wrapped in `.ui-v1` so the v2 typography
// scale never reflows the page, auto-`window.print()` once data is ready, 402
// MODULE_NOT_LICENSED → module panel, plain 402 → paused panel.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, BadgeCheck, Printer } from 'lucide-react'
import { useSchools } from '../context/SchoolContext.jsx'
import { accreditationApi, isModuleNotLicensed, isPaymentRequired } from '../lib/api.js'
import EntitlementPausedPanel from '../components/analytics/EntitlementPausedPanel.jsx'
// AIC PHASE H §0.4/§4.3 — THE DISCLAIMER WAS FORKED, AND THIS PAGE PRINTED BOTH.
// Until Phase H this footer rendered `data.disclaimer` (the server's
// READINESS_DISCLAIMER, "… Cognia, MSA-CESS or WCEA …") AND a second, separately
// worded client constant EVIDENCE_INDEX_DISCLAIMER ("… Cognia / MSA / WCEA …"),
// one immediately after the other — two sentences making the same promise in two
// different words, on the one document a school hands a visiting team. The
// server constant is now the only disclaimer in the product; the client one is
// deleted, and the footer (with its confidence caveat) is the shared
// `VisitPrintFooter` used by all four accreditation print surfaces.
import VisitPrintFooter from '../components/accreditation/print/VisitPrintFooter.jsx'
import { currencyLabel, whereItLives } from '../components/accreditation/evidenceMeta.js'
import { formatShortDate } from '../lib/format.js'

const ACCENT = '#F59E0B'

/** ISO → "Jun 30, 2026". Anything falsy → em dash. Never today, never a guess. */
function fmtDay(iso) {
  if (!iso) return '—'
  const day = String(iso).slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? formatShortDate(day) : day
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

function Section({ title, children }) {
  return (
    <section className="mt-6 break-inside-avoid">
      <h2
        className="border-b-2 pb-1.5 font-serif text-[17px] font-semibold text-navy"
        style={{ borderColor: ACCENT }}
      >
        {title}
      </h2>
      <div className="mt-2.5">{children}</div>
    </section>
  )
}

// ── The three derived cells, each a direct read of the payload ───────────────

/** Exists = we can point at something. Attached OR auto-resolved, either counts. */
function existsCell(group) {
  return (group.artifacts?.length ?? 0) > 0 ? 'Yes' : '—'
}

/**
 * Dated = the BEST artifact's own effective date. `capturedAt` and upload dates
 * are never read here — that substitution is the guess this phase bans. No
 * artifact at all → "—"; an artifact with no date → "Date unknown", which is a
 * real answer and excluded from the health denominator.
 */
function datedCell(group) {
  const best = group.artifacts?.[0]
  if (!best) return '—'
  return best.effectiveDate ? fmtDay(best.effectiveDate) : 'Date unknown'
}

/** Current = the state word, plus the date it hangs on when one was computed. */
function currentCell(group) {
  const label = currencyLabel(group.state)
  return group.expiresOn ? `${label} · ${fmtDay(group.expiresOn)}` : label
}

/** School-asserted only. NULL prints "—", never "No". */
function portalCell(group) {
  return group.alsoInPortal === true ? 'Yes' : '—'
}

export default function EvidenceIndexPrintPage() {
  const { activeSchool } = useSchools()
  const schoolId = activeSchool?.id ?? null

  const [data, setData] = useState(null)
  const [readiness, setReadiness] = useState(null)
  const [loading, setLoading] = useState(true)
  const [notLicensed, setNotLicensed] = useState(false)
  const [notEntitled, setNotEntitled] = useState(false)
  const [error, setError] = useState('')

  // Microtask defer + cancelled flag (the house print-page idiom), so it is
  // react-hooks/set-state-in-effect safe.
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
        .getEvidenceReadiness(schoolId)
        .then((res) => {
          if (!cancelled) setData(res.data ?? null)
        })
        .catch((e) => {
          if (cancelled) return
          if (isModuleNotLicensed(e)) setNotLicensed(true)
          else if (isPaymentRequired(e)) setNotEntitled(true)
          else setError('Could not assemble the evidence index.')
        })
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
      // The confidence caveat is Phase B's, reused VERBATIM rather than re-worded.
      // Fail-soft on its own: a readiness hiccup drops the caveat line, it never
      // blocks the index or invents a coverage figure to replace it.
      accreditationApi
        .getReadiness(schoolId)
        .then((res) => {
          if (!cancelled) setReadiness(res.data ?? null)
        })
        .catch(() => {
          if (!cancelled) setReadiness(null)
        })
    })
    return () => {
      cancelled = true
    }
  }, [schoolId])

  const ready = !loading && !!data

  // Auto-print once data is ready (one-shot) — the BoardReportPrintPage idiom.
  const printed = useRef(false)
  useEffect(() => {
    if (!printed.current && ready && !notEntitled && !notLicensed) {
      printed.current = true
      const t = setTimeout(() => window.print(), 400)
      return () => clearTimeout(t)
    }
  }, [ready, notEntitled, notLicensed])

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
            Add the Accreditation module to produce the evidence index for a visiting team.
          </p>
        </div>
      </div>
    )
  }

  const groups = data?.groups ?? []
  const health = data?.health ?? null
  const counts = data?.counts ?? null

  return (
    <div className="mx-auto max-w-[980px] px-4 py-8">
      {/* Screen-only toolbar (hidden in print). */}
      <div className="no-print mb-6 flex items-center justify-between">
        <Link
          to="/accreditation"
          className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-muted transition-colors hover:text-[#B45309]"
        >
          <ArrowLeft size={15} /> Back to accreditation
        </Link>
        <button onClick={() => window.print()} className="btn-primary inline-flex items-center gap-2">
          <Printer size={15} /> Print / Save as PDF
        </button>
      </div>

      {error ? <p className="text-center text-[14px] text-danger">{error}</p> : null}

      {!ready ? (
        !error && <p className="text-center text-[14px] text-muted">Preparing the evidence index…</p>
      ) : (
        <div className="ui-v1 rounded-xl border border-rule/60 bg-white p-8 print:rounded-none print:border-0 print:p-0">
          {/* ── Header ─────────────────────────────────────────────────────── */}
          <header className="border-b-4 pb-4" style={{ borderColor: ACCENT }}>
            <p
              className="text-[11px] font-semibold uppercase tracking-[0.18em]"
              style={{ color: ACCENT }}
            >
              Evidence Index
              {data.framework?.name ? ` · ${data.framework.name}` : ''}
            </p>
            <h1 className="mt-1 font-serif text-[28px] font-semibold leading-tight text-navy">
              {activeSchool?.name ?? 'School'}
            </h1>
            <p className="mt-1 text-[12px] text-muted">
              What a visiting team would ask for, whether it exists, whether it is dated, and
              whether it is still current — generated {fmtDay(data.generatedAt)}
              {data.demoData ? ' · demonstration data' : ''}
            </p>
          </header>

          {/* ── The index ──────────────────────────────────────────────────── */}
          <Section title="Required artifacts">
            {groups.length === 0 ? (
              <p className="text-[12px] italic text-muted">
                No required artifacts are defined for this framework. The standards register keeps
                its existing evidence behaviour, unchanged.
              </p>
            ) : (
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <Th wide>Artifact</Th>
                    <Th>Exists</Th>
                    <Th>Dated</Th>
                    <Th wide>Current</Th>
                    <Th wide>Where it lives</Th>
                    <Th wide>Standards it serves</Th>
                    <Th>Also in portal</Th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map((g) => (
                    <tr key={g.tag} className="break-inside-avoid">
                      <Td>
                        <span className="font-semibold text-navy">{g.label}</span>
                        {/* The group's own sentence, verbatim — including the
                            not-tracked wording and the auto-link disclosure. */}
                        {g.message ? (
                          <p className="mt-0.5 text-[10px] leading-snug text-muted">{g.message}</p>
                        ) : null}
                        {/* The server's sub-line — the policy aggregate's "only as
                            current as its most overdue policy" and its source
                            counts, or the curriculum convention. Verbatim. */}
                        {g.note ? (
                          <p className="mt-0.5 text-[10px] italic leading-snug text-muted">
                            {g.note}
                          </p>
                        ) : null}
                      </Td>
                      <Td className="whitespace-nowrap">{existsCell(g)}</Td>
                      <Td className="whitespace-nowrap">{datedCell(g)}</Td>
                      <Td>{currentCell(g)}</Td>
                      <Td>{whereItLives(g.sourceRegister, g.dataAvailability)}</Td>
                      <Td>
                        {(g.servesStandards ?? []).map((s) => s.code).join(', ') || '—'}
                      </Td>
                      <Td className="whitespace-nowrap">{portalCell(g)}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Section>

          {/* ── The closing counts — document CONTENT, above the footer rule ── */}
          <div className="mt-7 space-y-2">
            {/* ARTIFACT counts, the same population health.basis counts below —
                the footer and the figure never disagree about the total. */}
            {counts ? (
              <p className="text-[10.5px] text-muted">
                {counts.artifactsTracked ?? 0} of {counts.artifacts ?? 0} required artifacts are
                tracked in KYRO · {counts.standardsWithRequirements ?? 0} standards carry an
                artifact list, {counts.standardsLegacy ?? 0} do not.
              </p>
            ) : null}
            {health?.basis ? (
              <p className="text-[10.5px] text-muted">
                <span className="font-semibold text-navy">
                  {typeof health.evidenceHealthPct === 'number'
                    ? `${health.evidenceHealthPct}% current`
                    : 'Not scored'}
                </span>{' '}
                — {health.basis}
              </p>
            ) : null}
          </div>
          {/* The shared footer carries the disclaimer, the generated date and the
              Phase-B confidence caveat. It THROWS on a missing disclaimer rather
              than printing an undisclaimed document, so the page states the
              failure instead of mounting it — `/evidence-readiness` has carried
              the field since Phase C, so this branch is a tripwire, not a path. */}
          {data.disclaimer ? (
            <VisitPrintFooter
              disclaimer={data.disclaimer}
              generatedAt={data.generatedAt}
              demoData={data.demoData}
              confidence={readiness?.confidence ?? null}
              className="!mt-3"
            />
          ) : (
            <p className="mt-7 border-t border-rule pt-3 text-[10.5px] font-semibold text-danger">
              This index could not be published: the readiness disclaimer was missing from the
              payload.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
