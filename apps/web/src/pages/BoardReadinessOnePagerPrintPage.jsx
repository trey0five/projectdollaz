// ─────────────────────────────────────────────────────────────────────────────
// AIC Phase H §4.1 — THE BOARD READINESS ONE-PAGER (/accreditation/board/print).
//
// ONE page, for a board meeting. It is the shortest document this program
// produces and the one most likely to be read by someone who will never open the
// app, so every sentence on it is the server's and the page composes none.
//
// The substance is the EXECUTIVE SUMMARY — the same six segments, in the same
// order, that the Mock Visit screen prints, that the Mock Visit screen SPEAKS
// through `useNarrationPlayer`, and that the scheduled board email sends as
// paragraphs. One composer, four surfaces, and `visit-print.spec.jsx` (SPEC-WEB-4)
// compares the printed DOM text against the exact array handed to TTS. That
// comparison is acceptance 3 and it is the reason this page renders
// `<ExecutiveSummary/>` rather than mapping the segments itself: a second mapping
// is a second place for a sentence to be added, and the two surfaces would then
// be "the same" only until someone helpfully added a heading.
//
// Clones EvidenceIndexPrintPage structurally: inside AuthedLayout (SchoolProvider
// available; the AppShell chrome is `.no-print` and the sidebar offset is
// neutralized by the global print reset), a screen-only `.no-print` toolbar, the
// whole document wrapped in `.ui-v1` so the v2 typography scale never reflows the
// page, a one-shot auto `window.print()` once data is ready, 402
// MODULE_NOT_LICENSED → module panel, plain 402 → `<EntitlementPausedPanel/>`.
//
// NO MOTION AT ALL, anywhere on this page (acceptance 5). A print document that
// animates has nothing to gain and a `prefers-reduced-motion` obligation to meet;
// the cheapest way to honour it is to have no animation to suppress.
//
// WHAT THIS PAGE DELIBERATELY DOES NOT PRINT:
//   · no basis chain and no likelihood — the one-pager names WHAT and SO WHAT,
//     and the Visiting-Team Preview carries the evidence. A board member reading
//     a likelihood ordinal beside a truncated basis would read it as a forecast.
//   · no percentage on a finding (acceptance 2).
//   · no adopt control — this is paper.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowLeft, BadgeCheck, Printer } from 'lucide-react'
import { useSchools } from '../context/SchoolContext.jsx'
import { accreditationApi, isModuleNotLicensed, isPaymentRequired } from '../lib/api.js'
import EntitlementPausedPanel from '../components/analytics/EntitlementPausedPanel.jsx'
import ExecutiveSummary from '../components/accreditation/ExecutiveSummary.jsx'
import VisitPrintFooter from '../components/accreditation/print/VisitPrintFooter.jsx'
import { SEVERITY_RANK } from '../components/accreditation/ruleActions.js'
import { OWNER_ROLE_LABELS } from '../components/improvement/improvementMeta.js'
import { fmtDay } from '../components/accreditation/visitDates.js'

const ACCENT = '#F59E0B'

/**
 * The DOCUMENTED / DEFENSIBLE pair arrives on `acts.arrival` as the Phase-A
 * vocabulary — `number | null`. A figure we cannot read prints an em dash, never
 * a zero: "0% documented" and "we could not read your readiness" are different
 * facts, and only one of them is about the school.
 */
function pctOf(value) {
  return typeof value === 'number' && Number.isFinite(value) ? `${value}%` : '—'
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

function Stat({ label, value, sub }) {
  return (
    <div className="rounded-xl border border-rule/70 px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted">{label}</p>
      <p className="mt-0.5 font-serif text-[22px] font-semibold text-navy">{value}</p>
      {sub ? <p className="text-[11px] text-muted">{sub}</p> : null}
    </div>
  )
}

/**
 * Every finding the visit found, flattened out of its standard groups, worst
 * severity first. The grouping is the composer's and is not re-derived: this only
 * flattens and ranks, and JS sort stability keeps the composer's order inside a
 * severity. The standard code rides along so a finding is never printed
 * un-anchored.
 */
export function rankedFindings(findingsAct) {
  const grouped = (findingsAct?.groups ?? []).flatMap((g) =>
    (g.findings ?? []).map((f) => ({ finding: f, code: g.code ?? null })),
  )
  const schoolLevel = (findingsAct?.schoolLevel ?? []).map((f) => ({ finding: f, code: null }))
  return [...grouped, ...schoolLevel].sort(
    (a, b) =>
      (SEVERITY_RANK[a.finding?.severity] ?? 99) - (SEVERITY_RANK[b.finding?.severity] ?? 99),
  )
}

export default function BoardReadinessOnePagerPrintPage() {
  const { activeSchool, schools = [], setActiveSchool } = useSchools()
  const [params] = useSearchParams()
  const schoolId = activeSchool?.id ?? null

  // ── WHICH SCHOOL IS THIS DOCUMENT ABOUT? ──────────────────────────────────
  // The scheduled board email links here with `?school=<id>`, the way the
  // board-packet link is pinned with `?period=`. Without that qualifier this page
  // resolved its subject purely from the reader's PERSISTED SCOPE: a diocesan
  // recipient whose active school is A, opening school B's email, was handed A's
  // readiness one-pager — a fully valid-looking, disclaimed board document for the
  // wrong tenant, whose only tell was the school name in its own header, stating
  // different numbers from the email that carried it.
  //
  // A mismatch therefore renders NOTHING and says so. It does not silently switch
  // the reader's scope (a print link must not mutate where the rest of the app
  // thinks they are) and it does not fall back to the active school.
  const wantedSchoolId = params.get('school')
  const mismatch = !!wantedSchoolId && !!schoolId && wantedSchoolId !== schoolId
  const wantedSchool = wantedSchoolId
    ? (schools.find((s) => s?.id === wantedSchoolId) ?? null)
    : null

  const [visit, setVisit] = useState(null)
  const [loading, setLoading] = useState(true)
  const [notLicensed, setNotLicensed] = useState(false)
  const [notEntitled, setNotEntitled] = useState(false)
  const [error, setError] = useState('')

  // Microtask defer + cancelled flag (the house print-page idiom), so it is
  // react-hooks/set-state-in-effect safe.
  useEffect(() => {
    let cancelled = false
    if (!schoolId || mismatch) return undefined
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
          else setError('Could not assemble the board readiness one-pager.')
        })
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
    })
    return () => {
      cancelled = true
    }
  }, [schoolId, mismatch])

  const ready = !loading && !!visit && !mismatch

  // THE DISCLAIMER IS NOT OPTIONAL. If the payload arrived without one, the page
  // says so rather than printing an undisclaimed accreditation document — and it
  // does not auto-print either, because the fastest way to put an undisclaimed
  // readiness document in a board packet is to open the print dialog on one.
  const disclaimer = typeof visit?.disclaimer === 'string' ? visit.disclaimer.trim() : ''

  // Auto-print once data is ready (one-shot) — the BoardReportPrintPage idiom.
  const printed = useRef(false)
  useEffect(() => {
    if (!printed.current && ready && !!disclaimer && !notEntitled && !notLicensed) {
      printed.current = true
      const t = setTimeout(() => window.print(), 400)
      return () => clearTimeout(t)
    }
  }, [ready, disclaimer, notEntitled, notLicensed])

  // The link was for a different school than the reader is scoped to. Refuse,
  // name the school, and offer the switch — never render a board document that
  // resolved to a tenant the link did not ask for.
  if (mismatch) {
    return (
      <div className="mx-auto max-w-[980px] px-4 py-8">
        <div
          className="card-soft flex flex-col items-center gap-3 px-6 py-14 text-center"
          data-testid="board-one-pager-wrong-school"
        >
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gold-gradient text-navy shadow-glow">
            <BadgeCheck size={26} />
          </span>
          <h2 className="font-serif text-xl font-semibold text-navy">
            This one-pager is for a different school
          </h2>
          <p className="max-w-md text-[15px] text-muted">
            {wantedSchool
              ? `It was prepared for ${wantedSchool.name}, and you are currently working in ${activeSchool?.name ?? 'another school'}.`
              : 'It was prepared for a school you are not currently working in, and you may not have access to it.'}
          </p>
          {wantedSchool && setActiveSchool ? (
            <button
              type="button"
              onClick={() => setActiveSchool(wantedSchool.id)}
              className="rounded-full border border-rule/70 bg-white px-4 py-1.5 text-[13px] font-semibold text-navy transition hover:border-navy/40"
            >
              Switch to {wantedSchool.name}
            </button>
          ) : null}
        </div>
      </div>
    )
  }

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
            Add the Accreditation module to produce the board readiness one-pager.
          </p>
        </div>
      </div>
    )
  }

  const acts = visit?.acts ?? null
  const arrival = acts?.arrival ?? null
  const findingsAct = acts?.findings ?? null
  const unanswered = acts?.unanswered ?? null
  const planAct = acts?.plan ?? null

  const ranked = rankedFindings(findingsAct)
  const top = ranked.slice(0, 3)
  const more = Math.max(0, ranked.length - top.length)

  const rosterCounts = unanswered?.rosterCounts ?? null
  const holes = unanswered?.namedHoles ?? []
  const planItems = planAct?.items ?? []

  return (
    <div className="mx-auto max-w-[980px] px-4 py-8">
      {/* Screen-only toolbar (hidden in print). */}
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
          This one-pager could not be prepared: the readiness disclaimer was missing from the
          payload, and a readiness document is not published without it.
        </p>
      ) : null}

      {!ready ? (
        !error && <p className="text-center text-[14px] text-muted">Preparing the one-pager…</p>
      ) : !disclaimer ? null : (
        <div
          data-testid="board-one-pager"
          className="ui-v1 rounded-xl border border-rule/60 bg-white p-8 print:rounded-none print:border-0 print:p-0"
        >
          {/* ── Header ─────────────────────────────────────────────────────── */}
          <header className="border-b-4 pb-4" style={{ borderColor: ACCENT }}>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: ACCENT }}>
              Board Readiness One-Pager
              {visit.framework?.name ? ` · ${visit.framework.name}` : ''}
            </p>
            <h1 className="mt-1 font-serif text-[28px] font-semibold leading-tight text-navy">
              {activeSchool?.name ?? 'School'}
            </h1>
            <p className="mt-1 text-[12px] text-muted">
              Where accreditation readiness stands, what a visiting team would likely find, and what
              we cannot yet answer — generated {fmtDay(visit.generatedAt)}
              {visit.demoData ? ' · demonstration data' : ''}
            </p>
          </header>

          {/* ── Where we stand — the Phase-A pair, never a single number ───── */}
          <Section title="Where we stand">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Documented" value={pctOf(arrival?.documented)} sub="self-scored" />
              <Stat label="Defensible" value={pctOf(arrival?.defensible)} sub="evidenced" />
              <Stat
                label="Projected index"
                value={
                  typeof arrival?.projectedIndex === 'number' ? String(arrival.projectedIndex) : '—'
                }
                sub={arrival?.band ?? null}
              />
              <Stat
                label="As of"
                value={visit.snapshotAsOf ? fmtDay(visit.snapshotAsOf) : '—'}
                sub={visit.framework?.code ?? null}
              />
            </div>
            {arrival?.asOfLine ? (
              <p className="mt-2 text-[11.5px] leading-relaxed text-muted">{arrival.asOfLine}</p>
            ) : null}
            {arrival?.evaluableLine ? (
              <p className="mt-1 text-[11.5px] leading-relaxed text-muted">{arrival.evaluableLine}</p>
            ) : null}
            {/* Non-null exactly when the readiness read failed. Printed rather
                than swallowed: a board looking at four em dashes is owed the
                reason, and the reason is the composer's, not ours. */}
            {arrival?.unavailableReason ? (
              <p className="mt-1 text-[11.5px] italic leading-relaxed text-muted">
                {arrival.unavailableReason}
              </p>
            ) : null}
          </Section>

          {/* ── THE EXECUTIVE SUMMARY — the substance, and the acceptance-3 seam ── */}
          <Section title="Executive summary">
            <ExecutiveSummary
              segments={visit.executiveSummary?.segments ?? []}
              variant="print"
            />
          </Section>

          {/* ── What they'd likely find — top 3, no basis, no likelihood ───── */}
          <Section title="What a visiting team would likely find">
            {top.length === 0 ? (
              <p className="text-[12px] italic text-muted">
                No rule fired against today&apos;s evidence. That is not the same as nothing to
                find — see &ldquo;What we could not answer&rdquo; below.
              </p>
            ) : (
              <ul className="space-y-2.5">
                {top.map(({ finding, code }) => (
                  <li key={finding.findingKey} className="break-inside-avoid">
                    <p className="text-[12.5px] font-semibold text-navy">
                      <span className="mr-1.5 rounded border border-rule px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
                        {code ?? 'School-level'}
                      </span>
                      {finding.title}
                    </p>
                    {finding.consequence ? (
                      <p className="mt-0.5 text-[11.5px] leading-snug text-muted">
                        {finding.consequence}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
            {more > 0 ? (
              <p className="mt-2 text-[11.5px] italic text-muted">
                and {more} more — the full set, with its evidence, is on the visiting-team preview.
              </p>
            ) : null}
          </Section>

          {/* ── Act 5 survives even on the one-pager ───────────────────────── */}
          <Section title="What we could not answer">
            <p className="text-[12px] leading-relaxed text-muted">
              {holes.length} named hole{holes.length === 1 ? '' : 's'} in what we can see
              {rosterCounts
                ? ` · of ${rosterCounts.total} operating signals: ${rosterCounts.available} available, ${rosterCounts.notLicensed} not licensed, ${rosterCounts.noData} with no data, ${rosterCounts.notTracked} not tracked`
                : ''}
              {unanswered?.rules?.length
                ? ` · ${unanswered.rules.length} rule${
                    unanswered.rules.length === 1 ? '' : 's'
                  } could not be evaluated`
                : ''}
              . The full list, each with the reason in its own words, is on the visiting-team
              preview.
            </p>
            {unanswered?.signalsUnavailable?.message ? (
              <p className="mt-1 text-[11.5px] italic leading-relaxed text-muted">
                {unanswered.signalsUnavailable.message}
              </p>
            ) : null}
          </Section>

          {/* ── The plan ───────────────────────────────────────────────────── */}
          <Section title="The plan">
            {planItems.length === 0 ? (
              /* The composer's frozen sentence for THIS empty case — "no
                 framework adopted yet" and "everything is already being worked"
                 are different facts and get different sentences. Verbatim. */
              <p className="text-[12px] italic text-muted">
                {planAct?.unavailableReason ?? planAct?.emptyReason ?? ''}
              </p>
            ) : (
              <>
                {/* These are DRAFTED, not adopted. Calling a draft a commitment in
                    front of a board is exactly the overclaim this program bans. */}
                <p className="mb-2 text-[11.5px] text-muted">
                  {planItems.length} proposed commitment{planItems.length === 1 ? '' : 's'}, drafted
                  from what we can evidence. Nothing here is adopted until someone owns it.
                </p>
                <ul className="space-y-1.5">
                  {planItems.map((item) => (
                    <li key={item.originRef} className="break-inside-avoid text-[12px]">
                      <span className="font-semibold text-navy">{item.title}</span>
                      {item.suggestedOwnerRole ? (
                        <span className="text-muted">
                          {' '}
                          — suggested owner:{' '}
                          {OWNER_ROLE_LABELS[item.suggestedOwnerRole] ?? item.suggestedOwnerRole}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
                {planAct?.moreAvailable > 0 ? (
                  <p className="mt-1.5 text-[11.5px] italic text-muted">
                    and {planAct.moreAvailable} more on the improvement plan.
                  </p>
                ) : null}
              </>
            )}
          </Section>

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
