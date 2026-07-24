// ─────────────────────────────────────────────────────────────────────────────
// AdminOverviewPage — platform stat cards + a 30-day signups sparkline. Reads
// GET /admin/stats. The sparkline is a self-contained inline SVG (no chart lib).
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react'
import { Users, ShieldCheck, KeyRound, Building2, GraduationCap, TrendingUp } from 'lucide-react'
import { adminApi, apiErrorMessage } from '../../lib/api.js'
import { StatCard, SectionCard, LoadState, ErrorState } from './_ui.jsx'

// A tiny area + line sparkline over the { date, count } buckets.
function SignupsSparkline({ data }) {
  const W = 720
  const H = 160
  const PAD = 8
  if (!data?.length) return null
  const max = Math.max(1, ...data.map((d) => d.count))
  const n = data.length
  const x = (i) => PAD + (i * (W - PAD * 2)) / (n - 1 || 1)
  const y = (v) => H - PAD - (v / max) * (H - PAD * 2)
  const pts = data.map((d, i) => [x(i), y(d.count)])
  const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')
  const area = `${line} L${x(n - 1).toFixed(1)},${H - PAD} L${x(0).toFixed(1)},${H - PAD} Z`
  const last = pts[pts.length - 1]

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-40 w-full"
      preserveAspectRatio="none"
      role="img"
      aria-label="Signups over the last 30 days"
    >
      <defs>
        <linearGradient id="spark-area" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2563EB" stopOpacity={0.28} />
          <stop offset="100%" stopColor="#2563EB" stopOpacity={0} />
        </linearGradient>
        <linearGradient id="spark-line" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#2563EB" />
          <stop offset="100%" stopColor="#8b5cf6" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#spark-area)" />
      <path d={line} fill="none" stroke="url(#spark-line)" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
      {data.map((d, i) => (
        <circle key={i} cx={x(i)} cy={y(d.count)} r={7} fill="transparent">
          <title>{`${d.date}: ${d.count} signup${d.count === 1 ? '' : 's'}`}</title>
        </circle>
      ))}
      {last && <circle cx={last[0]} cy={last[1]} r={5} fill="#8b5cf6" fillOpacity={0.25} />}
      {last && <circle cx={last[0]} cy={last[1]} r={3} fill="#8b5cf6" />}
    </svg>
  )
}

export default function AdminOverviewPage() {
  const [stats, setStats] = useState(null)
  const [err, setErr] = useState(null)
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    setErr(null)
    try {
      const res = await adminApi.stats()
      setStats(res.data)
    } catch (e) {
      setErr(apiErrorMessage(e, 'Could not load platform stats.'))
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => {
    load()
  }, [])

  if (loading) return <LoadState label="Loading platform stats…" />
  if (err) return <ErrorState message={err} onRetry={load} />

  const t = stats?.totals || {}
  const signups = stats?.signups || []
  const signups30 = signups.reduce((a, d) => a + (d.count || 0), 0)
  const pct = (num, den) => (den > 0 ? `${Math.round((num / den) * 100)}%` : '—')

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatCard label="Total users" value={(t.users ?? 0).toLocaleString()} icon={Users} tone={['#2563EB', '#3b82f6']} />
        <StatCard
          label="Verified users"
          value={(t.verifiedUsers ?? 0).toLocaleString()}
          sub={`${pct(t.verifiedUsers, t.users)} verified · ${(t.unverifiedUsers ?? 0).toLocaleString()} pending`}
          accent="up"
          icon={ShieldCheck}
          tone={['#059669', '#10b981']}
        />
        <StatCard
          label="MFA-enabled"
          value={(t.mfaEnabledUsers ?? 0).toLocaleString()}
          sub={`${pct(t.mfaEnabledUsers, t.users)} of users`}
          icon={KeyRound}
          tone={['#8b5cf6', '#a78bfa']}
        />
        <StatCard label="Organizations" value={(t.organizations ?? 0).toLocaleString()} icon={Building2} tone={['#6366f1', '#818cf8']} />
        <StatCard label="Schools" value={(t.schools ?? 0).toLocaleString()} icon={GraduationCap} tone={['#06b6d4', '#22d3ee']} />
        <StatCard
          label="Signups · 30d"
          value={signups30.toLocaleString()}
          sub="new users in the last 30 days"
          accent="up"
          icon={TrendingUp}
          tone={['#FF6B5E', '#ff9182']}
        />
      </div>

      <SectionCard title="Signups" subtitle="New users per day — last 30 days (UTC)">
        <SignupsSparkline data={signups} />
      </SectionCard>
    </div>
  )
}
