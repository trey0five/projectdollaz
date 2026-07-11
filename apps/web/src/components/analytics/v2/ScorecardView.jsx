// ─────────────────────────────────────────────────────────────────────────────
// ScorecardView — the metrics TABLE per scope. School → the customizable Scorecard
// (shared /dashboard persistence). Compare → the CompareLeaderboard. Diocese → the
// DioceseScorecard (schools + roll-up row). Columns for the leaderboards are the
// user's visible-metric set (passed down) so all three scorecards agree.
// ─────────────────────────────────────────────────────────────────────────────
import Scorecard from './Scorecard.jsx'
import { CompareLeaderboard, DioceseScorecard } from './Leaderboard.jsx'

export default function ScorecardView({
  scope,
  school,
  compare,
  diocese,
  columns,
  canCustomize,
  onCrossToChart,
  highlight,
  onHighlightConsumed,
}) {
  if (scope === 'compare') return <CompareLeaderboard schools={compare.schools} columns={columns} />
  if (scope === 'diocese')
    return <DioceseScorecard schools={diocese.schools} columns={columns} orgMetrics={diocese.orgMetrics} />
  return (
    <Scorecard
      scope={scope}
      schoolId={school.id}
      metricsByKey={school.metricsByKey}
      canCustomize={canCustomize}
      onCrossToChart={onCrossToChart}
      highlight={highlight}
      onHighlightConsumed={onHighlightConsumed}
    />
  )
}
