import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import GoalCard from './GoalCard.jsx'

// The hero figure of a metric goal counts up to the number its FORMATTED string
// shows. A percent goal carries a raw 0..1 fraction (0.05) beside "5.0%"; counting
// toward the raw value settled on "0.1%" — the module's headline number, wrong.
afterEach(cleanup)

const base = {
  id: 'g1',
  title: 'Grow the annual fund',
  goalType: 'metric',
  metricLabel: 'Annual fund participation',
  owner: { name: 'Pat' },
  trend: [],
  milestones: [],
}

describe('GoalCard', () => {
  it('a percent goal settles on its formatted value, not the raw fraction', async () => {
    render(
      <GoalCard
        goal={{
          ...base,
          current: 0.05,
          formattedCurrent: '5.0%',
          formattedBaseline: '2.0%',
          formattedTarget: '10.0%',
          pctToTarget: 0.4,
          expectedPct: 0.3,
          paceStatus: 'on_track',
        }}
      />,
    )
    await waitFor(() => expect(screen.getByText('5.0%')).toBeTruthy(), { timeout: 10000 })
  }, 15000)

  it('a goal with no reading gives no pace verdict', () => {
    render(
      <GoalCard
        goal={{
          ...base,
          current: null,
          formattedCurrent: null,
          formattedTarget: '400',
          pctToTarget: null,
          expectedPct: 0.082,
          paceStatus: 'no_data',
        }}
      />,
    )
    expect(screen.getByText('Not measured yet')).toBeTruthy()
    expect(screen.queryByText('Behind pace')).toBeNull()
    expect(screen.queryByText('Ahead of pace')).toBeNull()
  })
})
