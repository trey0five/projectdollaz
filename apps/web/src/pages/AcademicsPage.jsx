// ─────────────────────────────────────────────────────────────────────────────
// AcademicsPage — the classroom command center: assessments, gradebook and
// lesson plans, with a full diocesan dashboard on its own Analytics tab.
//
// Academics is the first module whose analysis is too large for the Overview
// tab — it is a whole leadership deck, not a KPI strip — so it earns the new
// `analytics` tab rather than cramming the overview or spawning a sibling page.
//
// Everything on the dashboard is computed server-side by the pure assessment
// layer; this page fetches one payload and paints it.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { BookOpen, Sparkles, Upload, Users2 } from 'lucide-react'
import ModuleTabs, { ModuleAccent, useModuleTab } from '../components/module/ModuleTabs.jsx'
import { moduleTabs } from '../components/module/moduleAnatomy.js'
import AddDataTab from '../components/wizard/AddDataTab.jsx'
import AssessmentDashboard from '../components/academics/AssessmentDashboard.jsx'
import LessonPlanRegister from '../components/academics/LessonPlanRegister.jsx'
import GradesPanel from '../components/academics/GradesPanel.jsx'
import { useSchools } from '../context/SchoolContext.jsx'
import { academicsApi } from '../lib/api.js'

const HUE = '#0D9488'
const EASE = [0.2, 0.8, 0.2, 1]

export default function AcademicsPage() {
  const { activeId, activeSchool } = useSchools()
  // The sidebar drives ?tab= for every module; this page only reads it (and
  // writes it from the Overview's own door into the dashboard).
  const [, setTab] = useModuleTab(moduleTabs('academics'))
  const canEdit = activeSchool?.role === 'owner' || activeSchool?.role === 'accountant'

  const [status, setStatus] = useState(null)
  const [dashboard, setDashboard] = useState(null)
  const [query, setQuery] = useState({})
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [notLicensed, setNotLicensed] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(
    async (q = {}) => {
      if (!activeId) return
      setBusy(true)
      try {
        const [statusRes, dashRes] = await Promise.all([
          academicsApi.status(activeId).catch(() => null),
          academicsApi.dashboard(activeId, q),
        ])
        if (statusRes) setStatus(statusRes.data ?? statusRes)
        setDashboard(dashRes.data ?? dashRes)
        setNotLicensed(false)
        setError('')
      } catch (e) {
        if (e?.response?.status === 402) setNotLicensed(true)
        else setError(e?.response?.data?.message ?? 'Could not load academics.')
      } finally {
        setLoading(false)
        setBusy(false)
      }
    },
    [activeId],
  )

  // Reset the filters when the SCHOOL changes: last school's year/test/grade
  // almost certainly do not exist at the next one, so carrying them over asks
  // the API for a slice that is empty and shows "no data" for a school that has
  // plenty. `load` is keyed on activeId, so this fires exactly on a swap.
  useEffect(() => {
    setLoading(true)
    setQuery({})
    load({})
  }, [load]) // eslint-disable-line react-hooks/exhaustive-deps

  const onQuery = useCallback(
    (patch) => {
      const next = { ...query, ...patch }
      // null is an explicit CLEAR (see the test-type select), '' and undefined
      // are an absent value — all three drop the key rather than sending it.
      for (const k of Object.keys(next)) {
        if (next[k] === undefined || next[k] === '' || next[k] === null) delete next[k]
      }
      setQuery(next)
      load(next)
    },
    [query, load],
  )

  const level = dashboard?.school?.level

  if (notLicensed) {
    return (
      <div className="mx-auto max-w-3xl px-5 py-16 text-center">
        <BookOpen size={26} className="mx-auto mb-3" style={{ color: HUE }} />
        <h1 className="font-serif text-[26px] font-semibold text-navy">Academics isn&rsquo;t on this plan yet</h1>
        <p className="mx-auto mt-2 max-w-lg text-[15px] text-muted">
          Test scores, grades and lesson plans — with every school measured against its peers, grade by grade.
          Add the Academics module to switch it on.
        </p>
      </div>
    )
  }

  return (
    <ModuleAccent moduleKey="academics">
      <ModuleTabs
        moduleKey="academics"
        overview={
          <Panel>
            <AcademicsHero
              schoolName={activeSchool?.name}
              level={level}
              status={status}
              dashboard={dashboard}
              loading={loading}
            />
            <div className="mt-5">
              <OverviewTab
                dashboard={dashboard}
                status={status}
                loading={loading}
                onGoAnalytics={() => setTab('analytics')}
                onGoAdd={() => setTab('add')}
              />
            </div>
            {error ? <p className="mt-4 text-[13px] text-danger">{error}</p> : null}
          </Panel>
        }
        analytics={
          <Panel>
            <AcademicsHero
              schoolName={activeSchool?.name}
              level={level}
              status={status}
              dashboard={dashboard}
              loading={loading}
            />
            <div className="mt-5">
              {/* A failed fetch used to fall through to a fully rendered
                  dashboard of em-dashes, which reads as "we measured this and
                  it is empty" rather than "we could not load it". */}
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
              ) : loading && !dashboard ? (
                <p className="text-[13px] text-muted">Loading the comparison…</p>
              ) : (
                <AssessmentDashboard data={dashboard} onQuery={onQuery} loading={busy} />
              )}
            </div>
          </Panel>
        }
        addData={
          <Panel>
            {/* The wizard is the ONE door — it now carries the assessment
                upload, the gradebook upload, the lesson-plan flow and the SIS
                card. Rendering the uploader here too put the same dropzone on
                screen twice and pushed the wizard below the fold. */}
            <AddDataTab module="academics" onDone={() => load(query)} />
          </Panel>
        }
        records={
          <Panel>
            <div className="space-y-4">
              <GradesPanel schoolId={activeId} canEdit={canEdit} />
              <section className="rounded-2xl border border-navy/10 bg-white p-5">
                <p className="font-mono text-[9.5px] font-bold uppercase tracking-[0.18em]" style={{ color: HUE }}>
                  Lesson plans
                </p>
                <h3 className="mb-3 mt-0.5 font-serif text-[19px] font-semibold text-navy">The classroom register</h3>
                <LessonPlanRegister schoolId={activeId} canEdit={canEdit} />
              </section>
            </div>
          </Panel>
        }
      />
    </ModuleAccent>
  )
}

/** Each panel brings its own container — the ModuleTabs contract. */
function Panel({ children }) {
  return <div className="mx-auto max-w-6xl px-4 pb-16 pt-5 sm:px-10">{children}</div>
}

/** The hero — a live read on the classroom, not a title bar. */
function AcademicsHero({ schoolName, level, status, dashboard, loading }) {
  const a = status?.assessments
  const kpi = dashboard?.kpis
  const ctx = dashboard?.context

  const stats = useMemo(
    () => [
      { k: 'Average', v: kpi?.average?.value != null ? Number(kpi.average.value).toFixed(1) : '—' },
      { k: 'Rank', v: kpi?.rank?.rank ? `${kpi.rank.rank}/${kpi.rank.of}` : '—' },
      { k: 'Years on file', v: a?.years?.length ?? 0 },
      { k: 'Lesson plans', v: status?.lessonPlans?.total ?? 0 },
    ],
    [kpi, a, status],
  )

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: EASE }}
      className="relative overflow-hidden rounded-3xl px-6 py-6 text-white shadow-[0_28px_70px_-32px_rgba(13,148,136,0.6)]"
      style={{ background: 'linear-gradient(135deg, #0f766e 0%, #115e59 45%, #101c3d 100%)' }}
    >
      {/* Ambient halo — the same visual grammar as the rest of the app. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(40% 60% at 85% 20%, rgba(45,212,191,0.28) 0%, transparent 70%), radial-gradient(30% 50% at 10% 90%, rgba(59,130,246,0.20) 0%, transparent 70%)',
        }}
      />
      <div className="relative flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-teal-200">
            <BookOpen size={12} /> Academics
            {level && level !== 'unknown' ? (
              <span className="ml-1 rounded-full bg-white/15 px-2 py-0.5 text-[9px] tracking-wide">{level}</span>
            ) : null}
          </p>
          <h1 className="mt-2 font-serif text-[30px] font-semibold leading-tight sm:text-[36px]">
            {schoolName ?? 'This school'}, measured against its peers.
          </h1>
          <p className="mt-2 max-w-xl text-[14px] leading-relaxed text-white/70">
            {ctx
              ? `${(ctx.testType ?? '').toUpperCase()} · ${ctx.year} · ${
                  ctx.scoreType === 'percentile' ? 'national percentile' : 'scale score'
                } — grade by grade, subject by subject, against the schools around you.`
              : 'Upload a scores file and this school appears beside every other school in the network.'}
          </p>
        </div>
        <div className="flex gap-2.5">
          {stats.map((s, i) => (
            <motion.div
              key={s.k}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + i * 0.06, duration: 0.4, ease: EASE }}
              className="rounded-xl bg-white/10 px-3 py-2 text-center ring-1 ring-white/15 backdrop-blur-sm"
            >
              <p className="font-serif text-[20px] font-semibold leading-none tabular-nums">{loading ? '·' : s.v}</p>
              <p className="mt-1 font-mono text-[8.5px] uppercase tracking-[0.14em] text-white/60">{s.k}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </motion.div>
  )
}

/** Overview — the short read, with a door into the full dashboard. */
function OverviewTab({ dashboard, status, loading, onGoAnalytics, onGoAdd }) {
  if (loading) return <p className="text-[13.5px] text-muted">Loading…</p>

  if (!dashboard || dashboard.empty) {
    return (
      <div className="rounded-2xl border border-dashed border-navy/20 bg-white p-10 text-center">
        <Upload size={22} className="mx-auto mb-2" style={{ color: HUE }} />
        <p className="font-serif text-[19px] font-semibold text-navy">Start with a scores file</p>
        <p className="mx-auto mt-1.5 max-w-md text-[13.5px] text-muted">
          A diocesan summary, a publisher export, or a student-level file — the parser handles the title rows and
          odd column names that come with them.
        </p>
        <button
          type="button"
          onClick={onGoAdd}
          className="mt-4 rounded-xl px-4 py-2 text-[12.5px] font-bold uppercase tracking-[0.12em] text-white"
          style={{ background: HUE }}
        >
          Add academic data
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {dashboard.keyInsight ? (
        <div
          className="rounded-2xl px-5 py-4"
          style={{ background: `${HUE}12`, border: `1px solid ${HUE}30` }}
        >
          <p className="flex items-start gap-2.5 font-serif text-[15.5px] leading-relaxed text-navy">
            <Sparkles size={16} className="mt-0.5 shrink-0" style={{ color: HUE }} />
            {dashboard.keyInsight}
          </p>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          {
            k: 'Assessment results',
            v: `${status?.assessments?.rows ?? 0} rows`,
            s: `${status?.assessments?.years?.length ?? 0} year(s) on file`,
          },
          {
            k: 'Lesson plans',
            v: status?.lessonPlans?.total ?? 0,
            s: `${status?.lessonPlans?.byStatus?.draft ?? 0} still in draft`,
          },
          {
            k: 'Gradebook',
            v: status?.gradebook?.total ?? 0,
            s: `${status?.gradebook?.courses ?? 0} course(s)`,
          },
        ].map((c) => (
          <div key={c.k} className="rounded-2xl border border-navy/10 bg-white p-4">
            <p className="font-mono text-[9.5px] font-bold uppercase tracking-[0.16em] text-muted">{c.k}</p>
            <p className="mt-1 font-serif text-[24px] font-semibold text-navy tabular-nums">{c.v}</p>
            <p className="mt-0.5 text-[11.5px] text-muted">{c.s}</p>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={onGoAnalytics}
        className="flex w-full items-center justify-between rounded-2xl border border-navy/10 bg-white px-5 py-4 text-left transition-shadow hover:shadow-[0_18px_40px_-26px_rgba(16,28,61,0.45)]"
      >
        <span>
          <span className="flex items-center gap-2 font-serif text-[17px] font-semibold text-navy">
            <Users2 size={16} style={{ color: HUE }} /> Open the full comparison
          </span>
          <span className="mt-0.5 block text-[12.5px] text-muted">
            Every school ranked, grade-by-grade heat map, cohort growth, strengths and opportunities.
          </span>
        </span>
        <span className="rounded-lg px-3 py-1.5 text-[11.5px] font-bold text-white" style={{ background: HUE }}>
          Analytics
        </span>
      </button>
    </div>
  )
}
