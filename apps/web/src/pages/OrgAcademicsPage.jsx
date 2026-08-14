// ─────────────────────────────────────────────────────────────────────────────
// OrgAcademicsPage — the superintendent's academic console.
//
// The org endpoints (dashboard, the one-file diocesan upload) shipped with the
// module and had NO caller in the web app at all: the diocesan view — the thing
// the whole module was asked for — existed only as JSON. This is that screen.
//
// It is a DIFFERENT view from the school dashboard, not a re-skin. A school asks
// "where do we stand against the others"; a network asks "which of my schools
// needs me this month, and is the network as a whole moving". So the shape here
// is: the network's own average, then every school ranked, then who moved, then
// where each grade sits across the whole network.
//
// Nobody is anonymised. This is the superintendent's own console and these are
// their own schools — the anonymisation on the school page exists precisely
// because a school-level viewer is NOT this reader.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useMemo, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Section } from '../components/module/SectionHeader.jsx'
import ModuleBreadcrumb from '../components/module/ModuleBreadcrumb.jsx'
import { ModuleAccent } from '../components/module/ModuleTabs.jsx'
import { ArrowUpDown, Award, BookOpenCheck, ChevronRight, Grid3x3, Network, TrendingDown, Upload } from 'lucide-react'
import { useScope } from '../context/ScopeContext.jsx'
import { academicsApi } from '../lib/api.js'
import { testTypeLabel } from '../lib/academicsVocab.js'
import ModuleHero from '../components/module/ModuleHero.jsx'
import OrgAssessmentUpload from '../components/academics/OrgAssessmentUpload.jsx'

const HUE = '#0D9488'
const EASE = [0.2, 0.8, 0.2, 1]

const fmt = (v, d = 1) => (v === null || v === undefined ? '—' : Number(v).toFixed(d).replace(/\.0$/, ''))
const signed = (v, d = 1) => (v === null || v === undefined ? '—' : `${v >= 0 ? '+' : ''}${fmt(v, d)}`)

export default function OrgAcademicsPage() {
  // orgResolved gates the first fetch: SchoolContext lags on a scope swap, and
  // firing while orgId is still null renders the "not part of an organization"
  // panel to someone who very much is.
  const { orgId, orgName, orgResolved } = useScope()
  const reduce = useReducedMotion()
  const [data, setData] = useState(null)
  const [query, setQuery] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(
    async (q = {}) => {
      if (!orgId) return
      setLoading(true)
      try {
        const res = await academicsApi.orgDashboard(orgId, q)
        setData(res.data ?? res)
        setError('')
      } catch (e) {
        setError(e?.response?.data?.message ?? 'Could not load the network results.')
      } finally {
        setLoading(false)
      }
    },
    [orgId],
  )

  useEffect(() => {
    if (orgResolved) load(query)
  }, [load, orgResolved]) // eslint-disable-line react-hooks/exhaustive-deps

  const select = (patch) => {
    const next = { ...query, ...patch }
    for (const k of Object.keys(next)) {
      if (next[k] === undefined || next[k] === '' || next[k] === null) delete next[k]
    }
    setQuery(next)
    load(next)
  }

  const ctx = data?.context
  const ranked = useMemo(() => data?.schools ?? [], [data])

  if (!orgResolved) {
    return <div className="mx-auto max-w-page p-6 text-[13px] text-muted">Loading…</div>
  }

  if (!orgId) {
    return (
      <div className="mx-auto max-w-page p-6">
        <p className="text-[14px] text-muted">
          This account is not part of a multi-school organization, so there is no network to compare.
        </p>
      </div>
    )
  }

  return (
    // Nested routes fall outside ModuleTabs, which is what normally sets
    // --c-module — so without this the breadcrumb's arrow rendered navy on a
    // teal module's own page. `display: contents` costs no layout.
    <ModuleAccent moduleKey="academics">
    <div className="mx-auto max-w-page space-y-4 p-4 sm:p-6">
      {/* The sidebar's module section only grows on an EXACT module path, so a
          nested route like this one loses it — the same as
          /enrollment/diocesan-import, which is why that page carries a BackLink
          too. Without it there is no way back to Academics but the browser. */}
      {/* The same trail the module pages carry, so a reader who arrives here
          from the Overview's network card sees one continuous hierarchy rather
          than a differently-shaped back control on every screen. */}
      <ModuleBreadcrumb
        crumbs={[
          { label: 'Dashboard', to: '/app' },
          { label: 'Academics', to: '/academics' },
          { label: 'Network' },
        ]}
      />

      {/* ── Hero ── */}
      <ModuleHero
        module="academics"
        hue={HUE}
        eyebrow={
          <>
            <BookOpenCheck size={12} /> Academics · network
          </>
        }
        title={`${orgName ?? 'Your network'}, school by school.`}
        subtitle={`${ctx ? `${testTypeLabel(ctx.testType)} · ${ctx.year} · ` : ''}every school on one screen, ranked against the network they belong to.`}
        stats={
          data && !data.empty
            ? [
                { k: 'Network average', v: fmt(data.average?.value) },
                { k: 'Schools', v: data.average?.schools ?? 0 },
                { k: 'Students tested', v: (data.average?.tested ?? 0).toLocaleString() },
              ]
            : []
        }
      />

      {/* ── One file, every school ── */}
      <OrgAssessmentUpload orgId={orgId} onDone={() => load(query)} />

      {error ? (
        <div className="rounded-2xl border border-danger/25 bg-white p-6">
          <p className="text-[13px] font-semibold text-danger">{error}</p>
          <button
            type="button"
            onClick={() => load(query)}
            className="mt-3 rounded-xl border border-navy/15 px-4 py-2 text-[12px] font-semibold text-navy"
          >
            Try again
          </button>
        </div>
      ) : loading && !data ? (
        <p className="text-[13px] text-muted">Loading the network…</p>
      ) : data?.empty ? (
        <div className="rounded-2xl border border-dashed border-navy/20 bg-white p-10 text-center">
          <Upload size={22} className="mx-auto mb-2" style={{ color: HUE }} />
          <p className="font-serif text-[19px] font-semibold text-navy">No results across the network yet</p>
          <p className="mt-1 text-[12.5px] text-muted">
            Upload one file covering every school above, or let each school load its own.
          </p>
        </div>
      ) : (
        <>
          {/* ── Filters ── */}
          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-navy/10 bg-white px-4 py-3">
            <span className="font-mono text-[9.5px] font-bold uppercase tracking-[0.18em] text-muted">View</span>
            <select
              aria-label="Test"
              value={ctx?.testType ?? ''}
              onChange={(e) => select({ testType: e.target.value, schoolYear: null, gradeLevel: null })}
              className="rounded-lg border border-navy/15 bg-white px-2.5 py-1.5 text-[12.5px] text-navy"
            >
              {(ctx?.availableTestTypes ?? []).map((t) => (
                <option key={t} value={t}>
                  {testTypeLabel(t)}
                </option>
              ))}
            </select>
            <select
              aria-label="School year"
              value={ctx?.year ?? ''}
              onChange={(e) => select({ schoolYear: Number(e.target.value) })}
              className="rounded-lg border border-navy/15 bg-white px-2.5 py-1.5 text-[12.5px] text-navy"
            >
              {(ctx?.years ?? []).map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
            <select
              aria-label="Grade"
              value={ctx?.grade ?? 'all'}
              onChange={(e) => select({ gradeLevel: e.target.value })}
              className="rounded-lg border border-navy/15 bg-white px-2.5 py-1.5 text-[12.5px] text-navy"
            >
              <option value="all">All grades</option>
              {(ctx?.grades ?? []).map((g) => (
                <option key={g} value={g}>
                  Grade {g}
                </option>
              ))}
            </select>
            {loading ? <span className="text-[11.5px] text-muted">Updating…</span> : null}
          </div>

          {/* ── Every school ── */}
          <Section
            eyebrow="The network" icon={Network}
            title={`Every school · ${ctx?.grade === 'all' ? 'all grades' : `grade ${ctx?.grade}`}`}
            reduce={reduce}
          >
            <div className="space-y-1.5">
              {ranked.map((sc, i) => {
                const pct =
                  sc.value === null || sc.value === undefined
                    ? 0
                    : Math.max(
                        0,
                        Math.min(100, ((sc.value - (ctx?.scoreRange?.min ?? 0)) / ((ctx?.scoreRange?.max ?? 100) - (ctx?.scoreRange?.min ?? 0))) * 100),
                      )
                return (
                  <div key={sc.schoolId} className="flex items-center gap-3">
                    <span className="w-6 shrink-0 text-right font-mono text-[11px] text-muted">{sc.rank ?? '—'}</span>
                    <span className="w-48 shrink-0 truncate text-[12.5px] text-navy">{sc.schoolName}</span>
                    <div className="relative h-6 flex-1 overflow-hidden rounded-md bg-navy/[0.05]">
                      {ctx?.nationalReference !== null && ctx?.nationalReference !== undefined ? (
                        <div
                          className="absolute inset-y-0 z-10 border-l-2 border-dashed border-rose-500"
                          style={{
                            left: `${((ctx.nationalReference - (ctx.scoreRange?.min ?? 0)) / ((ctx.scoreRange?.max ?? 100) - (ctx.scoreRange?.min ?? 0))) * 100}%`,
                          }}
                          title={`National ${ctx.nationalReference}`}
                        />
                      ) : null}
                      <motion.div
                        initial={reduce ? { width: `${pct}%` } : { width: 0 }}
                        animate={{ width: `${pct}%` }}
                        transition={{ duration: 0.7, ease: EASE, delay: reduce ? 0 : i * 0.05 }}
                        className="h-full rounded-md"
                        style={{ background: `linear-gradient(90deg, ${HUE}, #14b8a6)` }}
                      />
                    </div>
                    <span className="w-12 text-right text-[12.5px] font-bold tabular-nums text-navy">
                      {sc.value === null || sc.value === undefined ? (sc.forthcoming ? 'due' : '—') : fmt(sc.value)}
                    </span>
                  </div>
                )
              })}
            </div>
            <p className="mt-2 text-[11px] text-muted">
              A school with fewer than five scored students shows no figure — its cohort is small enough that the
              average would describe the children in it.
            </p>
          </Section>

          {/* ── Movement + grades ── */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Section eyebrow="Year over year" title="Who moved, and which way" icon={ArrowUpDown} reduce={reduce}>
              {(data?.movements ?? []).length === 0 ? (
                <p className="text-[12.5px] text-muted">A second year of results lights this up.</p>
              ) : (
                <div className="space-y-1.5">
                  {data.movements.map((m) => {
                    const tone =
                      m.direction === 'improved' ? '#059669' : m.direction === 'declined' ? '#e11d48' : '#94a3b8'
                    return (
                      <div key={m.schoolId} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-navy/[0.03]">
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: tone }} />
                        <span className="flex-1 truncate text-[12.5px] text-navy">{m.schoolName}</span>
                        <span className="font-mono text-[11px] tabular-nums text-muted">
                          {fmt(m.prior, 0)} → {fmt(m.current, 0)}
                        </span>
                        <span className="w-10 text-right text-[12px] font-bold tabular-nums" style={{ color: tone }}>
                          {signed(m.change, 0)}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </Section>

            <Section eyebrow="Across the network" title="Where each grade sits" icon={Grid3x3} reduce={reduce} delay={0.05}>
              {(data?.byGrade ?? []).length === 0 ? (
                <p className="text-[12.5px] text-muted">No grade-level rows on file yet.</p>
              ) : (
                <div className="space-y-2">
                  {data.byGrade.map((g) => {
                    const v = g.average?.value ?? null
                    const max = ctx?.scoreRange?.max ?? 100
                    return (
                      <div key={g.grade} className="flex items-center gap-2.5">
                        <span className="w-16 shrink-0 text-right text-[11.5px] text-muted">Grade {g.grade}</span>
                        <div className="h-6 flex-1 overflow-hidden rounded-md bg-navy/[0.05]">
                          <motion.div
                            initial={reduce ? { width: `${((v ?? 0) / max) * 100}%` } : { width: 0 }}
                            animate={{ width: `${((v ?? 0) / max) * 100}%` }}
                            transition={{ duration: 0.6, ease: EASE }}
                            className="h-full rounded-md"
                            style={{ background: `linear-gradient(90deg, ${HUE}, #14b8a6)` }}
                          />
                        </div>
                        <span className="w-10 text-right text-[12px] font-semibold tabular-nums text-navy">{fmt(v, 0)}</span>
                        <span className="w-16 text-right font-mono text-[10.5px] text-muted">
                          {g.average?.tested ?? 0} tested
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </Section>
          </div>

          {/* ── Top, bottom, spread ── */}
          {data?.insights?.top ? (
            <Section eyebrow="At a glance" title="Top, bottom and the spread between" icon={Award} reduce={reduce}>
              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  { k: 'Highest', v: data.insights.top?.schoolName, n: data.insights.top?.value, Icon: Award, color: '#059669' },
                  {
                    k: 'Lowest',
                    v: data.insights.bottom?.schoolName,
                    n: data.insights.bottom?.value,
                    Icon: TrendingDown,
                    color: '#e11d48',
                  },
                  { k: 'Spread', v: 'Top to bottom', n: data.insights.spread, Icon: ChevronRight, color: '#64748b' },
                ].map((c) => (
                  <div key={c.k} className="rounded-xl border border-navy/10 px-3 py-2.5">
                    <p className="flex items-center gap-1.5 font-mono text-[9px] font-bold uppercase tracking-wider text-muted">
                      <c.Icon size={11} style={{ color: c.color }} /> {c.k}
                    </p>
                    <p className="mt-0.5 truncate text-[13px] font-semibold text-navy">{c.v ?? '—'}</p>
                    <p className="font-serif text-[18px] tabular-nums" style={{ color: c.color }}>
                      {fmt(c.n)}
                    </p>
                  </div>
                ))}
              </div>
            </Section>
          ) : null}
        </>
      )}
    </div>
    </ModuleAccent>
  )
}
