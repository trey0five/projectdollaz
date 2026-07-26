// ─────────────────────────────────────────────────────────────────────────────
// Governance Phase 2 — the accreditation-ready GOVERNANCE REPORT print route
// (/governance/report/print). Clones the BoardReportPrintPage pattern: lives
// with the other print routes inside AuthedLayout (SchoolProvider available; the
// AppShell chrome is .no-print and the sidebar offset is neutralized in the
// global print reset), fetches the fully-computed report from
// GET schools/:schoolId/governance/report (the web does ZERO math), renders a
// print-clean document, and auto-fires window.print() once data is ready.
// Wrapped in `.ui-v1` so the v2 typography scale never reflows the printed page.
// 402 MODULE_NOT_LICENSED → module panel; plain 402 → paused panel.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Printer, Landmark } from 'lucide-react'
import { useSchools } from '../context/SchoolContext.jsx'
import {
  governanceReportApi,
  isModuleNotLicensed,
  isPaymentRequired,
} from '../lib/api.js'
import EntitlementPausedPanel from '../components/analytics/EntitlementPausedPanel.jsx'
import { roleLabel, credentialTagLabel, isoDay } from '../components/governance/peopleMeta.js'

const ACCENT = '#7C3AED'

function fmtDay(iso) {
  const day = isoDay(iso)
  if (!day) return '—'
  const d = new Date(`${day}T00:00:00.000Z`)
  if (Number.isNaN(d.getTime())) return day
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

const TERM_STATUS = {
  active: { label: 'Active', cls: 'border-emerald-300 bg-emerald-50 text-emerald-700' },
  expiring_90d: { label: 'Expiring soon', cls: 'border-danger/40 bg-danger/10 text-danger' },
  expired: { label: 'Expired', cls: 'border-danger/50 bg-danger/15 text-danger' },
  no_term: { label: 'No term', cls: 'border-rule bg-section text-muted' },
}

function TermStatusBadge({ status }) {
  const b = TERM_STATUS[status] ?? TERM_STATUS.no_term
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold ${b.cls}`}
    >
      {b.label}
    </span>
  )
}

function Section({ title, children }) {
  return (
    <section className="mt-7 break-inside-avoid">
      <h2
        className="border-b-2 pb-1.5 font-serif text-[19px] font-semibold text-navy"
        style={{ borderColor: ACCENT }}
      >
        {title}
      </h2>
      <div className="mt-3">{children}</div>
    </section>
  )
}

function Th({ children, right }) {
  return (
    <th
      className={`border-b border-rule px-3 py-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted ${
        right ? 'text-right' : 'text-left'
      }`}
    >
      {children}
    </th>
  )
}

function Td({ children, right }) {
  return (
    <td className={`border-b border-rule/50 px-3 py-2 align-top text-[12.5px] ${right ? 'text-right' : ''}`}>
      {children}
    </td>
  )
}

function StatTile({ label, value, sub }) {
  return (
    <div className="rounded-xl border border-rule/70 px-4 py-3">
      <p className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted">{label}</p>
      <p className="mt-0.5 font-serif text-[22px] font-semibold text-navy">{value}</p>
      {sub ? <p className="text-[11.5px] text-muted">{sub}</p> : null}
    </div>
  )
}

function EmptyNote({ children }) {
  return <p className="text-[12.5px] italic text-muted">{children}</p>
}

export default function GovernanceReportPrintPage() {
  const { activeSchool } = useSchools()
  const schoolId = activeSchool?.id ?? null

  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [notLicensed, setNotLicensed] = useState(false)
  const [notEntitled, setNotEntitled] = useState(false)
  const [error, setError] = useState('')

  // Microtask defer + cancelled flag (the useCommittees idiom) so it is
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
      governanceReportApi
        .get(schoolId)
        .then((res) => {
          if (!cancelled) setData(res.data ?? null)
        })
        .catch((e) => {
          if (cancelled) return
          if (isModuleNotLicensed(e)) setNotLicensed(true)
          else if (isPaymentRequired(e)) setNotEntitled(true)
          else setError('Could not assemble the governance report.')
        })
        .finally(() => {
          if (!cancelled) setLoading(false)
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
      <div className="mx-auto max-w-[900px] px-4 py-8">
        <EntitlementPausedPanel />
      </div>
    )
  }

  if (notLicensed) {
    return (
      <div className="mx-auto max-w-[900px] px-4 py-8">
        <div className="card-soft flex flex-col items-center gap-3 px-6 py-14 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gold-gradient text-navy shadow-glow">
            <Landmark size={26} />
          </span>
          <h2 className="font-serif text-xl font-semibold text-navy">
            Governance isn&apos;t on your plan yet
          </h2>
          <p className="max-w-md text-[15px] text-muted">
            Add the Governance module to generate the board &amp; committee report.
          </p>
        </div>
      </div>
    )
  }

  const roster = data?.boardRoster ?? []
  const committees = data?.committees ?? []
  const finance = data?.financeTeam?.people ?? []
  const coverage = data?.financeTeam?.coverage ?? { withDocs: 0, total: 0 }
  const policy = data?.policySummary ?? null
  const minutes = data?.minutesDiscipline ?? null

  return (
    <div className="mx-auto max-w-[900px] px-4 py-8">
      {/* Screen-only toolbar (hidden in print). */}
      <div className="no-print mb-6 flex items-center justify-between">
        <Link
          to="/governance"
          className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-muted transition-colors hover:text-gold"
        >
          <ArrowLeft size={15} /> Back to governance
        </Link>
        <button onClick={() => window.print()} className="btn-primary inline-flex items-center gap-2">
          <Printer size={15} /> Print / Save as PDF
        </button>
      </div>

      {error ? <p className="text-center text-[14px] text-danger">{error}</p> : null}

      {!ready ? (
        !error && <p className="text-center text-[14px] text-muted">Preparing the governance report…</p>
      ) : (
        <div className="ui-v1 rounded-xl border border-rule/60 bg-white p-8 print:rounded-none print:border-0 print:p-0">
          {/* ── Header ─────────────────────────────────────────────────────── */}
          <header className="border-b-4 pb-4" style={{ borderColor: ACCENT }}>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: ACCENT }}>
              Governance &amp; Accreditation Report
            </p>
            <h1 className="mt-1 font-serif text-[30px] font-semibold leading-tight text-navy">
              {data.school?.name ?? activeSchool?.name ?? 'School'}
            </h1>
            <p className="mt-1 text-[12.5px] text-muted">
              Board roster · committees · credentials · policy &amp; minutes discipline — generated{' '}
              {fmtDay(data.generatedAt)}
            </p>
          </header>

          {/* ── Board roster ───────────────────────────────────────────────── */}
          <Section title="Board roster">
            {roster.length === 0 ? (
              <EmptyNote>No board members on the roster.</EmptyNote>
            ) : (
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <Th>Name</Th>
                    <Th>Title</Th>
                    <Th>Term</Th>
                    <Th>Status</Th>
                  </tr>
                </thead>
                <tbody>
                  {roster.map((p) => (
                    <tr key={p.id}>
                      <Td>
                        <span className="font-semibold text-navy">{p.name}</span>
                        {p.active === false ? (
                          <span className="ml-1.5 text-[11px] italic text-muted">(inactive)</span>
                        ) : null}
                        {p.bio ? (
                          <p className="mt-0.5 text-[11.5px] leading-snug text-muted">{p.bio}</p>
                        ) : null}
                      </Td>
                      <Td>{p.title ?? '—'}</Td>
                      <Td>
                        {p.termStart || p.termEnd
                          ? `${fmtDay(p.termStart)} → ${fmtDay(p.termEnd)}`
                          : '—'}
                      </Td>
                      <Td>
                        <TermStatusBadge status={p.termStatus} />
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Section>

          {/* ── Committees & members ───────────────────────────────────────── */}
          <Section title="Committees & members">
            {committees.length === 0 ? (
              <EmptyNote>No committees on record.</EmptyNote>
            ) : (
              <div className="space-y-4">
                {committees.map((c) => (
                  <div key={c.id} className="break-inside-avoid rounded-xl border border-rule/70 p-4">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <h3 className="font-serif text-[15.5px] font-semibold text-navy">
                        {c.name}
                        <span className="ml-2 text-[11.5px] font-normal capitalize text-muted">
                          {c.kind}
                        </span>
                      </h3>
                      <p className="text-[12px] text-muted">
                        {c.chairName ? (
                          <>
                            Chair: <span className="font-semibold text-navy">{c.chairName}</span>
                            {c.chairSource === 'legacy' ? (
                              <span className="ml-1 text-[10.5px] uppercase tracking-wide">
                                (legacy)
                              </span>
                            ) : null}
                          </>
                        ) : (
                          'No chair recorded'
                        )}
                        {' · '}
                        {c.memberCount} member{c.memberCount === 1 ? '' : 's'}
                      </p>
                    </div>
                    {c.members?.length ? (
                      <ul className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
                        {c.members.map((m) => (
                          <li
                            key={m.personId}
                            className="flex items-baseline justify-between gap-2 text-[12.5px]"
                          >
                            <span className="text-navy">
                              {m.name}
                              {m.title ? (
                                <span className="ml-1 text-[11px] italic text-muted">{m.title}</span>
                              ) : null}
                            </span>
                            <span className="shrink-0 font-semibold text-muted">
                              {roleLabel(m.role)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-2 text-[12px] italic text-muted">No members seated.</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* ── Finance-team credentials ───────────────────────────────────── */}
          <Section title="Finance team & credentials">
            <p className="mb-3 text-[12.5px] text-muted">
              Credentials on file:{' '}
              <span className="font-semibold text-navy">
                {coverage.withDocs}/{coverage.total}
              </span>{' '}
              team member{coverage.total === 1 ? '' : 's'} documented.
            </p>
            {finance.length === 0 ? (
              <EmptyNote>No finance-team members on the roster.</EmptyNote>
            ) : (
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <Th>Name</Th>
                    <Th>Title</Th>
                    <Th>Documents on file</Th>
                  </tr>
                </thead>
                <tbody>
                  {finance.map((p) => (
                    <tr key={p.id}>
                      <Td>
                        <span className="font-semibold text-navy">{p.name}</span>
                        {p.bio ? (
                          <p className="mt-0.5 text-[11.5px] leading-snug text-muted">{p.bio}</p>
                        ) : null}
                      </Td>
                      <Td>{p.title ?? '—'}</Td>
                      <Td>
                        {p.documents?.length ? (
                          <ul className="space-y-0.5">
                            {p.documents.map((doc) => (
                              <li key={doc.id}>
                                {doc.title}
                                {doc.tags?.length ? (
                                  <span className="ml-1.5 text-[11px] text-muted">
                                    ({doc.tags.map(credentialTagLabel).join(', ')})
                                  </span>
                                ) : null}
                                <span className="ml-1.5 text-[11px] text-muted">
                                  · {fmtDay(doc.createdAt)}
                                </span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <span className="font-semibold text-danger">None on file</span>
                        )}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Section>

          {/* ── Policy summary + minutes discipline ────────────────────────── */}
          <Section title="Policy & minutes discipline">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatTile
                label="Policies"
                value={policy ? String(policy.total) : '—'}
                sub={policy ? `${policy.active} active` : null}
              />
              <StatTile
                label="Past review"
                value={policy ? String(policy.pastReview) : '—'}
                sub={
                  policy?.lastAdoptedDate ? `last adopted ${fmtDay(policy.lastAdoptedDate)}` : null
                }
              />
              <StatTile
                label="Meetings held"
                value={minutes ? String(minutes.meetingsHeld) : '—'}
                sub={minutes ? `${minutes.approvedMinutes} minutes approved` : null}
              />
              <StatTile
                label="Minutes pending"
                value={minutes ? String(minutes.pendingApproval) : '—'}
                sub={
                  minutes?.lastApprovedAt ? `last approved ${fmtDay(minutes.lastApprovedAt)}` : null
                }
              />
            </div>
          </Section>

          <footer className="mt-8 border-t border-rule pt-3 text-[10.5px] text-muted">
            Prepared for accreditation and board records · generated {fmtDay(data.generatedAt)} ·
            KYRO Governance
          </footer>
        </div>
      )}
    </div>
  )
}
