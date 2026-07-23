// ─────────────────────────────────────────────────────────────────────────────
// AdminGeoPage — the geographic distribution of where users sign in from. Reads
// GET /admin/geo and renders the reused US_STATE_PATHS choropleth + Albers city
// dots (UsChoropleth), plus a top-states table and the "unknown" count.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react'
import { adminApi, apiErrorMessage } from '../../lib/api.js'
import { STATE_NAMES } from '../../data/usMapPaths.js'
import UsChoropleth from '../../components/admin/UsChoropleth.jsx'
import { SectionCard, Table, LoadState, ErrorState, EmptyState } from './_ui.jsx'

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
  const totalPlaced = states.reduce((a, s) => a + (s.count || 0), 0)
  const ranked = [...states].sort((a, b) => b.count - a.count)

  return (
    <div className="space-y-6">
      <SectionCard
        title="Where users sign in from"
        subtitle={`${totalPlaced.toLocaleString()} located across ${states.length} states · ${unknown.toLocaleString()} unknown / non-US`}
      >
        {states.length === 0 && cities.length === 0 ? (
          <EmptyState label="No located sign-ins yet. Geo fills in as users log in." />
        ) : (
          <UsChoropleth states={states} cities={cities} />
        )}
        {unknown > 0 && (
          <p className="mt-4 text-xs text-muted">
            <span className="font-medium text-ink">{unknown.toLocaleString()}</span> user
            {unknown === 1 ? '' : 's'} with no captured US state (never logged in, private/localhost
            IP, or outside the US).
          </p>
        )}
      </SectionCard>

      <SectionCard title="States by users" subtitle="Distinct users per state, most first">
        {ranked.length === 0 ? (
          <EmptyState />
        ) : (
          <Table head={['State', 'Users', 'Top cities']}>
            {ranked.map((s) => (
              <tr key={s.region} className="hover:bg-cream/60">
                <td className="px-3 py-2">
                  <span className="font-medium text-ink">{STATE_NAMES[s.region] || s.region}</span>
                  <span className="ml-1.5 text-xs text-muted">{s.region}</span>
                </td>
                <td className="px-3 py-2 tabular-nums">{s.count.toLocaleString()}</td>
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
