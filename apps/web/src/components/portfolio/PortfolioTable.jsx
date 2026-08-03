// ─────────────────────────────────────────────────────────────────────────────
// PortfolioTable — AIC Phase I. The ranked list a superintendent reads first.
//
// WHAT EVERY ROW MUST CARRY (spec §7.1): the band, the attention score, the
// urgency, the EVIDENCE-BACKED percentage, and its DRIVERS. A row that shows a
// rank and no reason is the thing this phase was built to stop shipping.
//
// THE TIEBREAK COLUMN IS `verifiedPct`, NOT `readinessPct`, AND THAT IS THE WHOLE
// POINT. `readinessPct` and `selfScoredPct` are dominated by what a school said
// about itself in a rubric. A portfolio that breaks ties on a self-score tells
// fourteen principals that the way to move down the superintendent's list is to
// score yourself more generously. `verifiedPct` is the evidence-backed term: the
// only way to move on it is to produce an artifact. Ranking on self-scores rewards
// optimistic self-assessment; ranking on evidence rewards evidence. WEB-3 pins the
// labelled column, because swapping one field name here is a one-character diff
// that reads as a tidy-up.
//
// THE ORDER IS THE SERVER'S. The comparator is frozen API-side (band, urgency,
// score, verifiedPct, name, schoolId) and there is deliberately no sort parameter
// anywhere in Phase I — so this component renders `ranked` IN THE ORDER IT
// ARRIVED and never sorts, re-sorts or "helpfully" stabilises anything. A click-
// to-sort header would make acceptance 6 (byte-identical ordering) unobservable.
//
// PERCENTILES ARE NEVER COMPUTED HERE (spec §7.2, §7.4, WEB-4). The API nulls
// `percentile` whenever a school has fewer than four peers, because a percentile
// over three peers is a statistic-shaped decoration. The rank still renders — that
// is a fact — and the percentile simply is not there.
// ─────────────────────────────────────────────────────────────────────────────
import AttentionBandChip, { UrgencyChip, pctText, percentileText } from './AttentionBandChip.jsx'
import DriversList from './DriversList.jsx'
import { DemoChip } from '../accreditation/ReadinessTrendStrip.jsx'

/**
 * The peer floor, mirroring the API's `MIN_PEERS_FOR_PERCENTILE` (spec §7.4).
 *
 * The API is the authority and already nulls `percentile` below four peers; this
 * is the SECOND gate, not a second opinion. It can only ever withhold — there is
 * no branch in which the web shows a percentile the API did not send — and it
 * means a server-side regression that starts emitting a percentile over three
 * peers surfaces as a missing statistic rather than as a fabricated one. A
 * percentile over three peers is a statistic-shaped decoration, and it is exactly
 * the small schools (which have the fewest peers) that would wear it.
 */
export const MIN_PEERS_FOR_PERCENTILE = 4

/**
 * The peer cell. `rank` is always emitted; `percentile` only when the API judged
 * the sample big enough. Nothing here derives a percentile from a rank — that
 * would reinstate, in JSX, exactly the statistic the server declined to publish.
 */
export function PeerCell({ peers = null }) {
  if (!peers || !Number.isFinite(peers.peerCount)) {
    return <span className="text-[12.5px] text-muted">No peer group</span>
  }
  const pctile =
    peers.peerCount >= MIN_PEERS_FOR_PERCENTILE ? percentileText(peers.percentile) : null
  const relaxed = Array.isArray(peers.relaxedDims) && peers.relaxedDims.length > 0
  return (
    <span className="inline-flex flex-col gap-0.5">
      <span className="text-[12.5px] font-semibold tabular-nums text-navy">
        {Number.isFinite(peers.rank) ? `Rank ${peers.rank}` : 'Rank —'}
        <span className="font-normal text-muted">
          {' '}
          · {peers.peerCount} {peers.peerCount === 1 ? 'peer' : 'peers'}
        </span>
      </span>
      {pctile ? (
        <span className="text-[11.5px] text-muted">{pctile}</span>
      ) : (
        // Deliberately does not use the WORD either: a sentence containing
        // "percentile" in the cell where a percentile was withheld is the thing a
        // reader skims and mis-remembers as having seen one.
        <span className="text-[11.5px] text-muted">Peer group too small to place it within</span>
      )}
      {relaxed && (
        <span className="text-[11px] text-muted">
          Peer match relaxed: {peers.relaxedDims.join(', ')}
        </span>
      )}
    </span>
  )
}

function FrameworkLine({ row }) {
  const parts = []
  if (row?.frameworkName) parts.push(row.frameworkName)
  else if (row?.frameworkCode) parts.push(row.frameworkCode)
  if (row?.snapshotDate) parts.push(`as of ${row.snapshotDate}`)
  if (parts.length === 0) return null
  return <span className="text-[11.5px] text-muted">{parts.join(' · ')}</span>
}

export default function PortfolioTable({ rows = [], indexComparable = true }) {
  const ranked = Array.isArray(rows) ? rows : []
  if (ranked.length === 0) {
    return (
      <div className="card-soft px-5 py-8 text-center">
        <p className="text-[14px] text-muted">
          No school in this organization can be ranked yet. The panels below name what is missing.
        </p>
      </div>
    )
  }

  return (
    <section aria-labelledby="portfolio-ranked" className="card-soft overflow-hidden">
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-5 pb-3 pt-5 sm:px-6">
        <h2 id="portfolio-ranked" className="font-serif text-[17px] font-semibold text-navy">
          Ranked by attention — {ranked.length} {ranked.length === 1 ? 'school' : 'schools'}
        </h2>
        <p className="text-[12px] text-muted">
          Ordered by the server: band, then urgency, then attention, then evidence coverage.
          {!indexComparable && ' Index scores are not compared across frameworks.'}
        </p>
      </div>

      {/* Wide content scrolls inside its own container — the page never scrolls
          sideways. */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[52rem] border-collapse text-left">
          <thead>
            <tr className="border-y border-rule/70 bg-section text-[11px] uppercase tracking-[0.12em] text-muted">
              <th scope="col" className="px-4 py-2.5 font-semibold">
                #
              </th>
              <th scope="col" className="px-4 py-2.5 font-semibold">
                School
              </th>
              <th scope="col" className="px-4 py-2.5 font-semibold">
                Attention
              </th>
              <th scope="col" className="px-4 py-2.5 font-semibold">
                Urgency
              </th>
              {/* THE TIEBREAK COLUMN. Evidence-backed coverage, never a self-score. */}
              <th scope="col" className="px-4 py-2.5 font-semibold">
                Evidence-backed
              </th>
              <th scope="col" className="px-4 py-2.5 font-semibold">
                Peers
              </th>
              <th scope="col" className="px-4 py-2.5 font-semibold">
                Why
              </th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((row) => (
              <tr key={row?.schoolId ?? row?.rank} className="border-b border-rule/50 align-top">
                <td className="px-4 py-3.5 text-[13px] font-semibold tabular-nums text-muted">
                  {row?.rank ?? '—'}
                </td>
                <td className="px-4 py-3.5">
                  <div className="flex flex-col gap-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-navy">{row?.name ?? 'Unnamed school'}</span>
                      {row?.demoData ? <DemoChip /> : null}
                    </span>
                    <FrameworkLine row={row} />
                  </div>
                </td>
                <td className="px-4 py-3.5">
                  <AttentionBandChip band={row?.attentionBand} score={row?.attentionScore} />
                </td>
                <td className="px-4 py-3.5">
                  <UrgencyChip urgency={row?.urgency} reason={row?.urgencyReason} />
                </td>
                {/* `verifiedPct` — the evidence-backed figure the server broke ties
                    on. Never `readinessPct`, never `selfScoredPct`. */}
                <td className="px-4 py-3.5 text-[13px] font-semibold tabular-nums text-navy">
                  {pctText(row?.verifiedPct) ?? (
                    <span className="font-normal text-muted">Not measured</span>
                  )}
                </td>
                <td className="px-4 py-3.5">
                  <PeerCell peers={row?.peers ?? null} />
                </td>
                <td className="px-4 py-3.5 min-w-[16rem] max-w-[26rem]">
                  <DriversList drivers={row?.drivers} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
