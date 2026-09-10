// EvidencePlatformChip — the accreditor's own portal (FCC → Accreditrac) as one
// quiet chip; the server's sentence is the tooltip/aria-label; NOTHING when the
// framework has no platform (an invented portal is an invented workflow).
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import EvidencePlatformChip from './EvidencePlatformChip.jsx'

afterEach(cleanup)

const FCC = {
  name: 'Accreditrac',
  line: 'The annual report, the self-study, evidence and the visitation are filed in the Florida Catholic Conference’s Accreditrac portal. KYRO organises what you will upload there; it does not submit on your behalf.',
}

describe('EvidencePlatformChip', () => {
  it('renders "Filed in <name>" with the server sentence as title + aria-label', () => {
    render(<EvidencePlatformChip platform={FCC} light />)
    const chip = screen.getByTestId('evidence-platform-chip')
    expect(chip.textContent).toBe('Filed in Accreditrac')
    expect(chip.getAttribute('title')).toBe(FCC.line)
    expect(chip.getAttribute('aria-label')).toBe(FCC.line)
    // The vendor's own spelling — never the "AccrediTrack" alias in the UI.
    expect(chip.textContent).not.toMatch(/AccrediTrack/)
  })

  it('renders NOTHING for null / undefined / a nameless platform', () => {
    for (const platform of [null, undefined, {}, { name: '' }]) {
      const { container, unmount } = render(<EvidencePlatformChip platform={platform} />)
      expect(container.innerHTML).toBe('')
      unmount()
    }
  })
})
