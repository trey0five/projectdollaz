// The networks console is a depiction, so its figures must agree with each
// other (a superintendent view whose roll-up disagreed with its own schools
// would undercut the drill-down pitch) and it must never name a real customer.
import { describe, it, expect } from 'vitest'
import { ORG_COMMAND } from './landingContent.js'

describe('ORG_COMMAND — the networks console', () => {
  const kpi = (label) => ORG_COMMAND.kpis.find((k) => k.label === label)

  it('names a fictional network, never a customer ("Sample" schools are real data)', () => {
    const text = JSON.stringify(ORG_COMMAND)
    expect(text).not.toMatch(/Sample/i)
    expect(ORG_COMMAND.consoleTitle).toMatch(/Bayview/)
  })

  it('rolls up from its own schools', () => {
    const { schools } = ORG_COMMAND
    expect(kpi('Schools').value).toBe(schools.length)
    const avg = schools.reduce((s, x) => s + x.pace, 0) / schools.length
    expect(kpi('Collections').value).toBe(Math.round(avg))
    expect(kpi('Need attention').value).toBe(schools.filter((s) => s.tone === 'amber').length)
  })

  it('every school and brief line carries a tone the console can show as a verdict', () => {
    for (const s of ORG_COMMAND.schools) {
      expect(['good', 'amber']).toContain(s.tone)
      expect(s.short && s.name.startsWith(s.short)).toBe(true)
    }
    for (const b of ORG_COMMAND.brief) expect(['good', 'amber']).toContain(b.tone)
  })
})
