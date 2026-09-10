// ─────────────────────────────────────────────────────────────────────────────
// AcademicsHeatmap — the grade × subject map on the shared stepped scale.
//
// Pinned: three cell states are three surfaces (value / suppressed hatch /
// absent), every cell is a keyboard-reachable role="img" with a full aria-label
// and NO native title, the scale steps by the family's material gap and prints
// its thresholds, and the variance — the thing colour encodes — leads the cell.
// ─────────────────────────────────────────────────────────────────────────────
import { afterEach, describe, it, expect } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import AcademicsHeatmap from './AcademicsHeatmap.jsx'
import { DIVERGING_MID, DIVERGING_NEG, DIVERGING_POS, SUPPRESSED_STYLE } from '../analytics/charts/heatScales.js'

const unit = { label: 'percentile', decimals: 0, span: '1–99', gap: 5, points: 'percentile points' }
const cells = [
  { grade: '3', subject: 'reading', value: 62, variance: 12 }, // +2 gaps → pos[1]
  { grade: '3', subject: 'math', value: 48, variance: -3 }, // within the gap → neutral
  { grade: '4', subject: 'reading', value: 40, variance: -21 }, // 4 gaps → neg[3]
  { grade: '4', subject: 'math', value: null, variance: null, suppressed: true },
  { grade: '5', subject: 'reading', value: 55, variance: 6 }, // 1 gap → pos[0]
  // grade 5 math: absent (no cell at all)
]

const toHex = (rgb) => {
  const m = /rgb\((\d+),\s*(\d+),\s*(\d+)\)/.exec(rgb)
  return m ? `#${[m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, '0')).join('')}`.toUpperCase() : rgb
}

describe('AcademicsHeatmap', () => {
  afterEach(cleanup)

  it('renders one keyboard-reachable cell per grade × subject with no native title', () => {
    render(<AcademicsHeatmap cells={cells} subjects={['reading', 'math', 'science']} unit={unit} reduce />)
    const imgs = screen.getAllByRole('img')
    // Science has no values → dropped; 3 grades × 2 subjects = 6 cells.
    expect(imgs).toHaveLength(6)
    for (const el of imgs) {
      expect(el.getAttribute('tabindex')).toBe('0')
      expect(el.getAttribute('aria-label')).toBeTruthy()
      expect(el.hasAttribute('title')).toBe(false)
    }
  })

  it('paints by the material-gap steps: level is grey, ahead blue, behind red, capped at four gaps', () => {
    render(<AcademicsHeatmap cells={cells} subjects={['reading', 'math']} unit={unit} reduce />)
    const byLabel = (re) => screen.getByRole('img', { name: re })
    expect(toHex(byLabel(/Reading · Grade 3/).style.background)).toBe(DIVERGING_POS[1].fill)
    expect(toHex(byLabel(/Math · Grade 3/).style.background)).toBe(DIVERGING_MID.fill)
    expect(toHex(byLabel(/Reading · Grade 4/).style.background)).toBe(DIVERGING_NEG[3].fill)
    expect(toHex(byLabel(/Reading · Grade 5/).style.background)).toBe(DIVERGING_POS[0].fill)
  })

  it('suppressed and absent are two different marks, neither a colour step', () => {
    render(<AcademicsHeatmap cells={cells} subjects={['reading', 'math']} unit={unit} reduce />)
    const sup = screen.getByRole('img', { name: /Math · Grade 4: fewer than 5 students, suppressed/ })
    expect(sup.getAttribute('data-heat-state')).toBe('suppressed')
    expect(sup.style.background).toContain('repeating-linear-gradient')
    expect(sup.textContent).toBe('<5')
    const abs = screen.getByRole('img', { name: /Math · Grade 5: no result on file/ })
    expect(abs.getAttribute('data-heat-state')).toBe('absent')
    expect(abs.style.background).not.toContain('gradient')
    expect(abs.textContent).toBe('—')
    expect(SUPPRESSED_STYLE.background).not.toBe(abs.style.background)
  })

  it('leads each cell with the variance and prints the legend thresholds in gap multiples', () => {
    const { container } = render(<AcademicsHeatmap cells={cells} subjects={['reading', 'math']} unit={unit} reduce />)
    const cell = screen.getByRole('img', { name: /Reading · Grade 3/ })
    expect(cell.textContent).toBe('+1262')
    expect(cell.querySelector('span > span')?.textContent).toBe('+12')
    const text = container.textContent
    for (const t of ['-20', '-15', '-10', '-5', '+5', '+10', '+15', '+20']) expect(text).toContain(t)
    expect(text).toMatch(/Within ±5 percentile points is level/)
  })

  it('falls back to a 5-point step when the family carries no gap', () => {
    const { container } = render(<AcademicsHeatmap cells={cells} subjects={['reading']} unit={{ decimals: 0 }} reduce />)
    expect(container.textContent).toContain('+20')
    expect(container.textContent).toMatch(/Within ±5 points is level/)
  })

  it('renders nothing when there are no cells', () => {
    const { container } = render(<AcademicsHeatmap cells={[]} subjects={['reading']} unit={unit} reduce />)
    expect(container.innerHTML).toBe('')
  })
})
