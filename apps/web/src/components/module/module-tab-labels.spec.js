// ─────────────────────────────────────────────────────────────────────────────
// Finance's third tab is NOT a register — it is three sub-page doors (Statements
// / Cash / Budget). Calling it "Records" made the word mean two different things
// across modules, which the user reported as confusing. The fix is a per-module
// tab-label override: the URL key stays `records` (frozen — wizard finish(),
// sidebar navIds and every deep link depend on it) while finance's LABEL becomes
// "Workspaces". moduleTabLabel() is the one read path for tab labels.
//
// Proven RED before the fix: moduleTabLabel did not exist, so this file failed
// at import ("does not provide an export named 'moduleTabLabel'").
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest'
import { moduleTabLabel, moduleTabs } from './moduleAnatomy.js'

describe('moduleTabLabel — per-module tab labels over one frozen key set', () => {
  it('finance relabels its records tab "Workspaces"', () => {
    expect(moduleTabLabel('finance', 'records')).toBe('Workspaces')
  })

  it('every other records-bearing module keeps the plain "Records" label', () => {
    for (const key of ['governance', 'enrollment', 'accreditation', 'facilities', 'advancement', 'strategy']) {
      expect(moduleTabs(key).includes('records'), `${key} lost its records tab?`).toBe(true)
      expect(moduleTabLabel(key, 'records')).toBe('Records')
    }
  })

  it('non-overridden tabs fall through to the canonical labels', () => {
    expect(moduleTabLabel('finance', 'overview')).toBe('Overview')
    expect(moduleTabLabel('finance', 'add')).toBe('Add data')
    expect(moduleTabLabel('finance', 'reports')).toBe('Reports')
  })

  it('an unknown tab key degrades to the key itself, never undefined in the UI', () => {
    expect(moduleTabLabel('finance', 'mystery')).toBe('mystery')
  })

  it('the URL KEY stays `records` — only the label changed (finish() contract)', () => {
    expect(moduleTabs('finance').includes('records')).toBe(true)
    expect(moduleTabs('finance').includes('workspaces')).toBe(false)
  })
})
