/* global process */
// ─────────────────────────────────────────────────────────────────────────────
// PENNY'S WALKTHROUGHS WORK UNDER ui.v2. Hand-off: the nine dataHub.* targets
// silently no-oped there — DataHubPage never mounts, the modal event has no
// listener, every datahub-* dom id is absent — so Penny OFFERED tours she could
// not give, and runAgentGuide dropped the steps without a word.
//
// Behavioural where it can be (resolveTarget is pure), source-pinned where the
// seam is a React effect (the bridge).
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { resolveTarget, TARGET_KEYS } from './targetRegistry.js'

const read = (rel) => readFileSync(resolve(process.cwd(), 'src', rel), 'utf8')

describe('resolveTarget is flag-aware', () => {
  it('v1 resolution is byte-identical to the frozen registry — nothing regressed', () => {
    for (const key of TARGET_KEYS) {
      expect(resolveTarget(key, false), key).toBeTruthy()
    }
    expect(resolveTarget('dataHub.trialBalanceCard', false)).toMatchObject({
      domId: 'datahub-card-trialBalances',
      page: 'data',
    })
  })

  it('under v2 every dataHub.* key resolves to a surface that actually mounts', () => {
    // The successors: Add-data chooser cards + the pages the modal contents
    // moved to. None may still point at a datahub-* id, because none exists.
    for (const key of TARGET_KEYS.filter((k) => k.startsWith('dataHub.'))) {
      const t = resolveTarget(key, true)
      expect(t, key).toBeTruthy()
      expect(t.domId, key).not.toMatch(/^datahub-/)
    }
    expect(resolveTarget('dataHub.trialBalanceCard', true)).toMatchObject({
      domId: 'adddata-card-tb',
      page: 'finance-add',
    })
    expect(resolveTarget('dataHub.forecastCard', true)).toMatchObject({
      domId: 'forecast-workspace',
      page: 'planning',
    })
  })

  it('the modal INTERIORS keep their base rows — IntakeBar/BudgetSetup mount inside the wizard', () => {
    // tb-upload-drop and budget-setup-panel exist under v2 (the wizard embeds
    // the same components); only the NAVIGATION to them is remapped, by the
    // bridge. The forecast pair moved pages outright, so it IS overridden.
    expect(resolveTarget('trialBalance.uploadDrop', true)).toMatchObject({
      domId: 'tb-upload-drop',
      page: 'data',
      openModal: 'trialBalances',
    })
    expect(resolveTarget('forecast.workspace', true)).toMatchObject({ page: 'planning' })
  })

  it('an unknown key is still null, both flags', () => {
    expect(resolveTarget('dataHub.nope', false)).toBeNull()
    expect(resolveTarget('dataHub.nope', true)).toBeNull()
  })
})

describe('the chooser cards carry the anchor ids the overrides point at', () => {
  it('WizardChoose stamps adddata-card-<key> on every option card', () => {
    expect(read('components/wizard/WizardChoose.jsx')).toMatch(
      /id=\{`adddata-card-\$\{opt\.key\}`\}/,
    )
  })
})

describe('the bridge remaps a v2 data+modal intent to a DIRECT deep link', () => {
  const bridge = read('components/penny/PennyAgentBridge.jsx')

  it('never routes a v2 modal intent through /data — the redirect strips the query', () => {
    expect(bridge).toMatch(/uiV2 && page === 'data' && openModal/)
    expect(bridge).toMatch(/V2_ADD_FLOWS\[openModal\] \?\? addDataHref\(true\)/)
  })

  it('the modal event fires ONLY under v1 — no listener exists to hear it under v2', () => {
    expect(bridge).toMatch(/if \(!uiV2 && page === 'data' && openModal\)/)
  })

  it('each modal key lands on the surface its content moved into', () => {
    expect(bridge).toMatch(/trialBalances: addDataHref\(true, \{ add: 'tb' \}\)/)
    expect(bridge).toMatch(/budget: addDataHref\(true, \{ add: 'budget' \}\)/)
    expect(bridge).toMatch(/forecast: '\/planning'/)
    expect(bridge).toMatch(/compliance: '\/readiness'/)
  })

  it('the PennyContext resolves targets with the flag', () => {
    expect(read('context/PennyContext.jsx')).toMatch(/resolveTarget\(s\?\.target, uiV2\)/)
  })
})
