// ─────────────────────────────────────────────────────────────────────────────
// The one sentence under each peer rail.
//
// This is where the peer view stopped lying. It used to print a percentile —
// "88 · 100th pctile" — which at one peer can only ever mean "you won", and
// which the server dressed up further as "Top quartile on days cash on hand".
// A school was handed a statistical claim about a group of two.
//
// So the caption says only what is TRUE at the size of the group it has:
//   • one peer   → the gap, named:      "25 days ahead of North Miami Beach"
//   • a few      → the rank, a fact:    "2nd of 4 · median 63"
//   • a real one → the percentile too, once there is a distribution to be in
// and, whenever the metric has an agreed healthy range, what the number MEANS —
// because "−0.5 months of reserve" is alarming whether or not it beats a peer,
// and that is the half the old view never said at all.
//
// PURE. No JSX, no hooks, no formatting invented locally — every figure comes
// through the registry formatter, so a caption can never disagree with the
// number printed above it.
// ─────────────────────────────────────────────────────────────────────────────
import { healthStatus, ordinal } from '@finrep/analytics'
import { formatMetricValue, metricFormat } from '../../../lib/metricMeta.js'

/** What the band verdict is called in a sentence. Null when there is no band. */
export function bandVerdict(value, bands) {
  const status = healthStatus(value ?? null, bands ?? undefined, value != null)
  if (status === 'good') return 'inside the healthy range'
  if (status === 'watch') return 'short of the healthy range'
  if (status === 'risk') return 'well below the healthy range'
  return null // 'neutral' — no band for this metric, or nothing to judge
}

/**
 * @param stat       PeerStatEntry — { rank, count, percentile, median, medianFormatted, focusValue, goodDirection }
 * @param points     [{ id, name, value, formatted, isFocus }] — schools WITH a value
 * @param metricKey  for the formatter
 * @param unit       raw unit off the metric
 * @param bands      { good, risk, goodDirection } | null
 * @returns string | null
 */
export function peerCaption({ stat, points = [], metricKey, unit, bands = null }) {
  if (!stat) return null
  const focus = points.find((p) => p.isFocus)
  const peers = points.filter((p) => !p.isFocus)

  // NOT REPORTED. The old view showed "you — · 0th pctile", which reads as
  // "bottom of your group" for a school that simply had not filed the figure.
  if (!focus || focus.value == null) {
    if (peers.length === 1) {
      return `You haven’t reported this yet — ${peers[0].name} is at ${peers[0].formatted}.`
    }
    if (peers.length > 1 && stat.medianFormatted) {
      return `You haven’t reported this yet — the peer median is ${stat.medianFormatted}.`
    }
    return 'You haven’t reported this yet.'
  }

  const fmt = metricFormat(metricKey, unit ?? 'ratio')
  const parts = []

  if (peers.length === 1) {
    const other = peers[0]
    const diff = focus.value - other.value
    if (diff === 0) {
      parts.push(`Level with ${other.name}`)
    } else {
      const ahead = stat.goodDirection === 'lower' ? diff < 0 : diff > 0
      parts.push(
        `${formatMetricValue(Math.abs(diff), fmt)} ${ahead ? 'ahead of' : 'behind'} ${other.name}`,
      )
    }
  } else if (peers.length > 1) {
    parts.push(`${ordinal(stat.rank)} of ${stat.count}`)
    if (stat.medianFormatted) parts.push(`median ${stat.medianFormatted}`)
  }

  // The percentile is present ONLY when the group is big enough for it to mean
  // something — the server withholds it below MIN_PEERS_FOR_PERCENTILE.
  if (stat.percentile != null) {
    parts.push(`${Math.round(stat.percentile * 100)}th percentile`)
  }

  const verdict = bandVerdict(focus.value, bands)
  if (verdict) parts.push(verdict)

  return parts.length ? `${parts.join(' · ')}.` : null
}
