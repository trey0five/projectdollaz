// ─────────────────────────────────────────────────────────────────────────────
// ReadinessDial — the projected index on the Aurora band. Since the page passes
// `dial={false}` to ReadinessHero, THIS is the production path for the big
// number, so the improvement-honesty pins are repeated here against it:
//   · the headline is `projectedIndex`, never inFlight.expectedIndexIfDelivered;
//   · the in-flight ghost says PROJECTION in its tooltip;
//   · below every band the dot is the risk (rose) colour, in a band it is mint;
//   · the accreditor's published reference (fw.indexReference) is drawn as a
//     display-only tick labelled from the payload.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import ReadinessDial from './ReadinessDial.jsx'

afterEach(cleanup)

const FW = {
  id: 'fw-1',
  code: 'cognia_2022',
  name: 'Cognia Performance Standards (2022)',
  statusBands: [
    { label: 'Accredited', min: 280 },
    { label: 'Accredited with Merit', min: 320 },
  ],
  indexMin: 100,
  indexMax: 400,
}

const BASE = {
  framework: FW,
  projectedIndex: 290,
  band: 'Accredited',
  belowThreshold: false,
}

const dot = (container) => container.querySelector('circle')

describe('ReadinessDial — the band’s projected index stays honest', () => {
  it('the big number is projectedIndex, never the in-flight projection', () => {
    const { container } = render(
      <ReadinessDial readiness={{ ...BASE, inFlight: { expectedIndexIfDelivered: 335 } }} reduce />,
    )
    expect(container.querySelector('.acc-dial-num').textContent).toBe('290')
    expect(container.querySelector('.acc-dial-num').textContent).not.toBe('335')
    const ghost = screen.getByTestId('band-dial-projection')
    expect(ghost.querySelector('title').textContent).toContain('PROJECTION')
    expect(ghost.querySelector('title').textContent).toContain('Not your current index')
  })

  it('no in-flight work → no projection ghost at all', () => {
    render(<ReadinessDial readiness={BASE} reduce />)
    expect(screen.queryByTestId('band-dial-projection')).toBeNull()
  })

  it('below every band → the risk dot; in a band → the good dot', () => {
    const { container, unmount } = render(
      <ReadinessDial readiness={{ ...BASE, projectedIndex: 180, band: null, belowThreshold: true }} reduce />,
    )
    expect(dot(container).getAttribute('fill')).toBe('#e11d48')
    unmount()
    const again = render(<ReadinessDial readiness={BASE} reduce />)
    expect(dot(again.container).getAttribute('fill')).toBe('#10b981')
  })

  it('the accreditor reference tick is drawn, display-only, labelled from the payload', () => {
    render(
      <ReadinessDial
        readiness={{
          ...BASE,
          framework: { ...FW, indexReference: { value: 296, label: 'Cognia network average IEQ (2024–25)' } },
        }}
        reduce
      />,
    )
    const tick = screen.getByTestId('index-reference-tick')
    expect(tick.querySelector('title').textContent).toBe('Cognia network average IEQ (2024–25)')
    expect(tick.textContent).toContain('296')
  })

  it('no reference in the payload → no tick; no index scale → no dial', () => {
    const { unmount } = render(<ReadinessDial readiness={BASE} reduce />)
    expect(screen.queryByTestId('index-reference-tick')).toBeNull()
    unmount()
    const { container } = render(
      <ReadinessDial readiness={{ ...BASE, framework: { ...FW, indexMin: null, indexMax: null } }} reduce />,
    )
    expect(container.querySelector('.acc-dial')).toBeNull()
  })
})
