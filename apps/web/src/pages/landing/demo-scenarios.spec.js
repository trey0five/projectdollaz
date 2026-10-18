// The hero's KYRO demo is a depiction: the schools it names must be the same
// FICTIONAL Bayview network the #networks console shows (never a customer —
// "Sample" schools are real data), its counts must agree with that console,
// and each scripted stream must finish typing before the beat that snaps it.
import { describe, it, expect } from 'vitest'
import { SCENARIOS, STATIC_FINAL_FRAME } from './demoScenarios.js'
import { ORG_COMMAND } from './landingContent.js'

const WORDS = ['two', 'three', 'four', 'five', 'six', 'seven']
const n = (word) => WORDS.indexOf(word) + 2

describe('demoScenarios — the hero KYRO demo', () => {
  it('never names a real customer school', () => {
    const text = JSON.stringify({ SCENARIOS, STATIC_FINAL_FRAME })
    expect(text).not.toMatch(/Sample/i)
  })

  it('the network question names only Bayview schools, with counts that agree with the console', () => {
    const diocese = SCENARIOS.find((s) => s.id === 'diocese')
    const answer = diocese.beats.find((b) => b.type?.field === 'assistantText').type.text
    const named = [...answer.matchAll(/\*\*(.+?)\*\*/g)].map((m) => m[1])
    expect(named.length).toBeGreaterThan(0)
    for (const school of named) expect(ORG_COMMAND.schools.map((s) => s.name)).toContain(school)
    const m = answer.match(/^(\w+) of your (\w+) schools/i)
    expect(n(m[1].toLowerCase())).toBe(named.length)
    expect(n(m[2])).toBe(ORG_COMMAND.schools.length)
    const done = answer.match(/for the (\w+) that are done/)[1]
    expect(n(done)).toBe(ORG_COMMAND.schools.length - named.length)
  })

  it('every typewriter finishes before the next beat that writes its field', () => {
    for (const s of SCENARIOS) {
      s.beats.forEach((b, i) => {
        if (!b.type) return
        const snap = s.beats.slice(i + 1).find((x) => x.patch && b.type.field in x.patch)
        if (snap) expect(b.at + b.type.text.length * b.type.ms).toBeLessThanOrEqual(snap.at)
      })
    }
  })

  it('every scenario ends on an advance beat, so the demo loops', () => {
    for (const s of SCENARIOS) expect(s.beats.at(-1).advance).toBe(true)
  })
})
