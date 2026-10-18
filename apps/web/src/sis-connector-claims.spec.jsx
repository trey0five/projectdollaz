/* global process */
// ─────────────────────────────────────────────────────────────────────────────
// WE ONLY OFFER THE SIS CONNECTORS WE RUN.
//
// FACTS, Veracross and OneRoster API (REST) ship built-to-spec in apps/api but
// are DARK: customer-gated, their config keys empty (apps/api config.enrollment),
// and the status endpoint's `configured` flag only ever reports Blackbaud. The
// live paths are Blackbaud SKY (OAuth) and the OneRoster ZIP/CSV roster file.
// The Add-data "Connect your SIS" card named all four as if connectable (on
// camera in the demo), and the picker let you choose them. This pins:
//   · the wizard card copy names no dark connector as offered;
//   · the connector picker shows the dark ones as disabled "coming soon";
//   · picking stays impossible, so the key form never renders for them.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { render, cleanup } from '@testing-library/react'
import EnrollmentConnectCard from './components/enrollment/EnrollmentConnectCard.jsx'

const read = (rel) => readFileSync(resolve(process.cwd(), 'src', rel), 'utf8')
const DARK = /\b(FACTS|Veracross)\b/

afterEach(cleanup)

describe('SIS connector claims', () => {
  it('the "Connect your SIS" wizard card names only the live connector', () => {
    const src = read('components/wizard/wizardConfigs.jsx')
    const at = src.indexOf("label: 'Connect your SIS'")
    expect(at).toBeGreaterThan(-1)
    const card = src.slice(at, src.indexOf('renderEmbed', at))
    expect(card).toMatch(/Blackbaud SKY/)
    expect(card).not.toMatch(DARK)
    expect(card).not.toMatch(/OneRoster\)/) // no "(…, OneRoster)" live-API claim
  })

  it('marketing copy never lists a dark connector', () => {
    for (const f of ['pages/landing/OrbitScrolly.jsx', 'pages/landing/BentoWall.jsx', 'pages/landing/landingContent.js', 'components/home/tileRegistry.jsx', 'pages/DataHubPage.jsx']) {
      expect(read(f), f).not.toMatch(DARK)
    }
  })

  it('the picker offers Blackbaud and shows the dark connectors as disabled "coming soon"', () => {
    const { container } = render(
      <EnrollmentConnectCard schoolId="s1" canEdit status={{ configured: true, connected: false }} onChanged={() => {}} />,
    )
    const options = [...container.querySelectorAll('select option')]
    const byValue = Object.fromEntries(options.map((o) => [o.value, o]))
    expect(byValue.blackbaud.disabled).toBe(false)
    for (const k of ['facts', 'veracross', 'oneroster_api']) {
      expect(byValue[k].disabled, k).toBe(true)
      expect(byValue[k].textContent, k).toMatch(/coming soon/i)
    }
    // the key/secret form for a dark provider is never on screen
    expect(container.querySelector('input[placeholder="API secret"]')).toBeNull()
  })
})
