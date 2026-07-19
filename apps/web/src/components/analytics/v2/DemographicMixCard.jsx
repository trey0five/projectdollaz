// ─────────────────────────────────────────────────────────────────────────────
// DemographicMixCard — the AGGREGATE demographic breakdown of a school's latest
// enrollment snapshot (gender / ethnicity / race), rendered as BarLists (memory:
// skewed mixes = BarList, never donuts). Shares are computed from the raw counts
// via the frozen-contract `toShares` (web mirror in lib/demographicVocab), and a
// Blau/Simpson `diversityIndex` badge sits in the header (server value preferred,
// else computed from the race counts). Aggregate counts only — no student PII.
// Navy/gold theme utilities (no hardcoded hex except the categorical bar palette,
// the accepted data-viz exception).
// ─────────────────────────────────────────────────────────────────────────────
import { Users } from 'lucide-react'
import BarList from '../charts/BarList.jsx'
import { CATEGORICAL_LIGHT } from './chartPalette.js'
import {
  GENDER_KEYS,
  GENDER_LABELS,
  ETHNICITY_KEYS,
  ETHNICITY_LABELS,
  RACE_KEYS,
  RACE_LABELS,
  toShares,
  diversityIndex,
} from '../../../lib/demographicVocab.js'

const pct = (share) => `${Math.round((Number(share) || 0) * 100)}%`

// counts + ordered keys/labels → BarList rows (value = share, formatted = %,
// share gutter = the raw count). Rows with a zero count are dropped.
function toRows(counts, keys, labels) {
  const shares = toShares(counts)
  return keys
    .map((k, i) => ({
      id: k,
      label: labels[k] ?? k,
      color: CATEGORICAL_LIGHT[i % CATEGORICAL_LIGHT.length],
      value: shares[k] ?? 0,
      formatted: pct(shares[k]),
      share: `${Number(counts?.[k] ?? 0).toLocaleString('en-US')}`,
      raw: Number(counts?.[k] ?? 0),
    }))
    .filter((r) => r.raw > 0)
}

function Section({ title, rows }) {
  if (!rows.length) return null
  return (
    <div>
      <h4 className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-muted">{title}</h4>
      <BarList rows={rows} formatter={pct} />
    </div>
  )
}

export default function DemographicMixCard({ byDemographics, diversityIndex: dvIndex }) {
  const dem = byDemographics || {}
  const gender = toRows(dem.gender, GENDER_KEYS, GENDER_LABELS)
  const ethnicity = toRows(dem.ethnicity, ETHNICITY_KEYS, ETHNICITY_LABELS)
  const race = toRows(dem.race, RACE_KEYS, RACE_LABELS)
  const hasAny = gender.length || ethnicity.length || race.length

  const idx = Number.isFinite(dvIndex) ? dvIndex : diversityIndex(dem.race)

  if (!hasAny) {
    return (
      <div className="rounded-2xl border-2 border-dashed border-rule/60 bg-cream/50 px-6 py-10 text-center">
        <p className="font-serif text-[16px] italic text-muted">No demographic breakdown yet.</p>
        <p className="mt-1 text-[13px] text-muted">
          Import a diocesan enrollment file with gender / ethnicity / race detail to see the mix.
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border-2 border-rule/50 bg-white p-5 shadow-card">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gold/15 text-gold">
            <Users size={18} />
          </span>
          <h3 className="font-serif text-lg font-bold text-navy">Demographic mix</h3>
        </div>
        {race.length > 0 && (
          <span
            className="inline-flex items-center gap-1.5 rounded-full border border-gold/40 bg-gold/10 px-3 py-1 text-[13px] font-bold text-navy"
            title="Blau/Simpson diversity index (1 − Σ p²): 0 = one race, →1 = evenly mixed"
          >
            Diversity {idx.toFixed(2)}
          </span>
        )}
      </div>
      <div className="space-y-4">
        <Section title="Gender" rows={gender} />
        <Section title="Ethnicity" rows={ethnicity} />
        <Section title="Race" rows={race} />
      </div>
      <p className="mt-3 text-[11.5px] text-muted">Aggregate counts only — no student-level detail.</p>
    </div>
  )
}
