// ─────────────────────────────────────────────────────────────────────────────
// SAID ONCE, NOT DROPPED. When every row in a group carries the identical
// "why" line, the line moves up to the group as one caption; whenever the
// lines differ they stay per row. The meaning never changes — these pin that
// the reason is still ON SCREEN in both shapes (the WEB-6 / horizon honesty
// intents), only de-duplicated.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import VelocityPanel from './VelocityPanel.jsx'
import HorizonTimeline from '../accreditation/HorizonTimeline.jsx'

afterEach(cleanup)

const ORG = { initiatives: 0, initiativesWithObservations: 0, improved: 0, flat: 0, declined: 0, unresponded: 0, basis: 'insufficient', reason: 'no_observations' }
const school = (id, reason, basis = 'insufficient') => ({
  schoolId: id,
  name: `School ${id}`,
  initiatives: 1,
  observations: 0,
  deltaPctPoints: null,
  basis,
  reason,
})

describe('VelocityPanel — a shared reason is said once', () => {
  it('every school unmeasurable for the same reason → one caption, no per-row repeat', () => {
    const { container } = render(
      <VelocityPanel data={{ windowDays: 90, org: ORG, schools: [school('a', 'no_observations'), school('b', 'no_observations'), school('c', 'no_observations')], notes: [] }} />,
    )
    const caption = screen.getByTestId('velocity-shared-reason')
    expect(caption.textContent).toMatch(/not measurable yet for any school/i)
    expect(caption.textContent).toMatch(/no observations/i)
    const rows = container.querySelectorAll('.b1-list li')
    expect(rows).toHaveLength(3)
    for (const r of rows) expect(r.textContent).not.toMatch(/not measurable yet/i)
  })

  it('reasons that differ stay on each row', () => {
    const { container } = render(
      <VelocityPanel data={{ windowDays: 90, org: ORG, schools: [school('a', 'no_observations'), school('b', 'span_too_short')], notes: [] }} />,
    )
    expect(screen.queryByTestId('velocity-shared-reason')).toBeNull()
    const rows = container.querySelectorAll('.b1-list li')
    expect(rows[0].textContent).toMatch(/not measurable yet — no observations/i)
    expect(rows[1].textContent).toMatch(/not measurable yet — span too short/i)
  })
})

const undated = (key, reason) => ({ findingKey: key, title: `Finding ${key}`, standardTags: [], horizon: { kind: 'none', reason } })

describe('HorizonTimeline — the undated column says a shared reason once', () => {
  it('identical reasons → one caption under the heading, none per row', () => {
    const same = 'This is a condition today, not a projection.'
    const { container } = render(
      <HorizonTimeline findings={[undated('a', same), undated('b', same), undated('c', same)]} now="2026-10-15" />,
    )
    expect(screen.getByTestId('horizon-shared-reason').textContent).toBe(same)
    expect(container.textContent.split(same).length - 1).toBe(1)
  })

  it('differing reasons stay per row, verbatim', () => {
    const { container } = render(
      <HorizonTimeline findings={[undated('a', 'Reason one.'), undated('b', 'Reason two.')]} now="2026-10-15" />,
    )
    expect(screen.queryByTestId('horizon-shared-reason')).toBeNull()
    expect(container.textContent).toContain('Reason one.')
    expect(container.textContent).toContain('Reason two.')
  })
})
