// ─────────────────────────────────────────────────────────────────────────────
// AdminGeoPage — the geographic distribution of where users sign in from. Reads
// GET /admin/geo and renders the reused US_STATE_PATHS choropleth + Albers city
// dots (UsChoropleth), plus a top-states table and the "unknown" count.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react'
import { adminApi, apiErrorMessage } from '../../lib/api.js'
import { STATE_NAMES } from '../../data/usMapPaths.js'
import UsChoropleth from '../../components/admin/UsChoropleth.jsx'
import { SectionCard, Table, LoadState, ErrorState, EmptyState, SECTION_TONE } from './_ui.jsx'

const TONE = SECTION_TONE.geography

export default function AdminGeoPage() {
  const [geo, setGeo] = useState(null)
  const [err, setErr] = useState(null)
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    setErr(null)
    try {
      const res = await adminApi.geo()
      setGeo(res.data)
    } catch (e) {
      setErr(apiErrorMessage(e, 'Could not load geographic data.'))
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => {
    load()
  }, [])

  if (loading) return <LoadState label="Loading geography…" />
  if (err) return <ErrorState message={err} onRetry={load} />

  const states = geo?.states || []
  const cities = geo?.cities || []
  const unknown = geo?.unknown || 0
  const totals = geo?.totals || {}
  const totalIps = totals.ips ?? states.reduce((a, s) => a + (s.count || 0), 0)
  const totalSessions = totals.sessions ?? 0
  const activeNow = totals.active ?? 0
  const activeWindow = geo?.activeWindowMinutes ?? 15
  const ranked = [...states].sort((a, b) => b.count - a.count)

  return (
    <div className="space-y-6">
      <SectionCard
        tone={TONE}
        title="Where users sign in from"
        subtitle={`${totalIps.toLocaleString()} session IP${totalIps === 1 ? '' : 's'} across ${states.length} state${states.length === 1 ? '' : 's'} · ${totalSessions.toLocaleString()} sign-in${totalSessions === 1 ? '' : 's'}`}
        right={
          <span
            className="inline-flex items-center gap-2 rounded-full border border-green-500/30 bg-green-500/10 px-3 py-1 text-xs font-semibold text-green-700"
            title={`Sessions active in the last ${activeWindow} minutes`}
          >
            <span className="relative inline-flex h-2.5 w-2.5 items-center justify-center">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-500 opacity-70 motion-reduce:hidden" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
            </span>
            {activeNow.toLocaleString()} active now
          </span>
        }
      >
        {states.length === 0 && cities.length === 0 ? (
          <EmptyState label="No located sign-ins yet. Geo fills in as users log in from public IPs." />
        ) : (
          <UsChoropleth states={states} cities={cities} activeWindowMinutes={activeWindow} />
        )}
        {unknown > 0 && (
          <p className="mt-4 text-xs text-muted">
            <span className="font-medium text-ink">{unknown.toLocaleString()}</span> session IP
            {unknown === 1 ? '' : 's'} with no captured US state (private/localhost IP or outside the
            US). Sign-ins from private/localhost IPs aren&apos;t geolocated.
          </p>
        )}
      </SectionCard>

      <SectionCard tone={TONE} title="States by session IPs" subtitle="Distinct session IPs per state, most first">
        {ranked.length === 0 ? (
          <EmptyState />
        ) : (
          <Table tone={TONE} head={['State', 'Session IPs', 'Sign-ins', 'Active now', 'Top cities']}>
            {ranked.map((s) => (
              <tr key={s.region} className="transition-colors hover:bg-cyan-500/[0.06]">
                <td className="px-3 py-2">
                  <span className="font-medium text-ink">{STATE_NAMES[s.region] || s.region}</span>
                  <span className="ml-1.5 text-xs text-muted">{s.region}</span>
                </td>
                <td className="px-3 py-2 tabular-nums">{s.count.toLocaleString()}</td>
                <td className="px-3 py-2 tabular-nums text-muted">{(s.sessions ?? s.count).toLocaleString()}</td>
                <td className="px-3 py-2 tabular-nums">
                  {s.active > 0 ? (
                    <span className="inline-flex items-center gap-1.5 font-medium text-green-700">
                      <span className="relative inline-flex h-2 w-2 items-center justify-center">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-500 opacity-70 motion-reduce:hidden" />
                        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-green-500" />
                      </span>
                      {s.active}
                    </span>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </td>
                <td className="px-3 py-2 text-muted">
                  {(s.cities || [])
                    .slice(0, 4)
                    .map((c) => `${c.city} (${c.count})`)
                    .join(', ') || '—'}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </SectionCard>
    </div>
  )
}
