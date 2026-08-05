/* global process */
// ─────────────────────────────────────────────────────────────────────────────
// THE PRODUCT STOPS CONGRATULATING ITSELF OVER ZEROS.
//
// A trial balance can save perfectly, balance perfectly, and produce an
// entirely empty set of statements — which is exactly what happened to every
// school whose chart of accounts we could not read. What made that a defect
// rather than a gap is what the product said next: "Balanced ✓", "Your
// statements are ready", "Your books are live" — over thirty-three zeros.
//
// The engine can read any chart now, but a school still has to say what its
// accounts ARE, and until it does the honest state is "saved, but we can't read
// it yet". These pin that the claims follow the numbers.
//
// Also pinned here: the celebration is reachable from the overview. It was only
// ever on the first-run screen — the one screen a user deliberately leaves and
// cannot return to.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const read = (rel) => readFileSync(resolve(process.cwd(), 'src', rel), 'utf8')
const page = read('pages/FinancePage.jsx')
const band = read('components/finance/IntakeConfirmBand.jsx')
const embed = read('components/datahub/TrialBalanceModalBody.jsx')

describe('the claim follows the numbers', () => {
  it('there is ONE signal, and it reads the computed totals', () => {
    // Not "a file arrived" and not "the trial balance balanced" — both were
    // true the whole time the statements were empty.
    expect(page).toMatch(
      /const statementsHaveNumbers = \(totalRevenue \?\? 0\) !== 0 \|\| \(totalExpense \?\? 0\) !== 0/,
    )
  })

  it('the first-run hero says what is actually true', () => {
    expect(page).toMatch(/statementsHaveNumbers\s*\n?\s*\? 'Your statements are ready'/)
    expect(page).toMatch(/One step left — tell us what these accounts are/)
  })

  it('the hero explains the fix rather than just withholding praise', () => {
    // "We can't read this" with no next step is a dead end, not honesty.
    expect(page).toMatch(/categorise the accounts below and your statements fill in/i)
  })

  it('the checkpoint offers no celebration when there is nothing to celebrate', () => {
    expect(embed).toMatch(/dataReady = true/)
    expect(embed).toMatch(/dataReady=\{dataReady\}/)
    expect(page).toMatch(/dataReady=\{statementsHaveNumbers\}/)
    // The confirm band swaps its whole call to action.
    expect(band).toMatch(/\{dataReady \? 'Does this look right\?' : 'Saved — but we can’t read it yet'\}/)
    expect(band).toMatch(/Categorise my accounts/)
  })

  it('the ADD-DATA TAB gets the same gate — it is the screen most schools use', () => {
    // Live-caught: the honesty gate was wired only into the first-run branch,
    // so the wizard path went on asking "does this look right?" and offering
    // the celebration over thirty-three uncategorised accounts.
    const tab = read('components/wizard/AddDataTab.jsx')
    const configs = read('components/wizard/wizardConfigs.jsx')
    expect(page).toMatch(/onLitUp=\{\(\) => setRevealSchoolId\(schoolId\)\}\s*\n\s*dataReady=\{statementsHaveNumbers\}/)
    expect(tab).toMatch(/dataReady = true/)
    expect(tab).toMatch(/dataReady,/)
    expect(configs).toMatch(/dataReady=\{ctx\.dataReady !== false\}/)
  })

  it('"show me what lit up" is not offered over an empty statement', () => {
    // The button exists only in the dataReady arm of the band…
    const idx = band.indexOf('Yes — show me what lit up')
    expect(idx).toBeGreaterThan(-1)
    expect(band.slice(0, idx)).toMatch(/\{dataReady \? \(/)
    // …and the first-run hero's replay control is hidden the same way.
    expect(page).toMatch(/hidden=\{!statementsHaveNumbers\}/)
  })
})

describe('categorising changes what the page says', () => {
  it('a confirmed category broadcasts the refresh signal', () => {
    // Live-caught: the API rebuilds the statements on this call, but nothing
    // told the browser. A user could classify their entire chart of accounts
    // and watch the screen go on insisting it could not read their books.
    const appCtx = read('context/AppContext.jsx')
    const at = appCtx.indexOf('mappingApi.mergeEntries')
    expect(at).toBeGreaterThan(-1)
    expect(appCtx.slice(at, at + 900)).toMatch(/penny:data-changed/)
    expect(appCtx).toMatch(/detail: \{ key: 'metrics' \}/)
  })

  it('…and the finance page listens for it', () => {
    expect(page).toMatch(/reload: reloadMetrics/)
    expect(page).toMatch(/if \(e\?\.detail\?\.key === 'metrics'\) reloadMetrics\(\)/)
  })
})

describe('the celebration is reachable from where people live', () => {
  it('the overview header carries a replay control', () => {
    expect(page).toMatch(/function FinanceHeader\(\{ onWhatLitUp = null \}\)/)
    expect(page).toMatch(/onWhatLitUp && \(/)
    expect(page).toMatch(
      /<FinanceHeader onWhatLitUp=\{statementsHaveNumbers \? \(\) => setRevealSchoolId\(schoolId\) : null\} \/>/,
    )
  })

  it('…and it only condenses from the ONE place that means "I am finished"', () => {
    // finance-first-run.spec pins this count too; repeated here because the
    // overview control is the obvious thing to wire to the wrong setter.
    const setters = page.match(/setCondensedSchoolId\(schoolId\)/g) ?? []
    expect(setters.length).toBe(2)
  })

  it('the reveal describes the period the user is LOOKING at', () => {
    // activePeriod is whichever period the intake last wrote to; the overview
    // hands the user a period picker. Replaying there could headline one year
    // while the cards behind it showed another.
    expect(page).toMatch(/const revealPeriod =\s*\n?\s*savedPeriods\.find\(\(p\) => p\.id === selectedPeriodId\) \?\? activePeriod/)
    expect(page).toMatch(/period=\{revealPeriod\}/)
    // The account count belongs to activePeriod's files, so it is only claimed
    // when the two agree.
    expect(page).toMatch(/accounts=\{revealPeriodMatches \? revealAccounts : 0\}/)
  })
})

describe('finishing an upload points somewhere worth going', () => {
  const wizard = read('components/wizard/AddDataWizard.jsx')
  const confirm = read('components/wizard/WizardConfirm.jsx')

  it('the success step offers the result, not just the filing cabinet', () => {
    expect(confirm).toMatch(/onSeeResult = null/)
    expect(confirm).toMatch(/\{seeResultLabel\}/)
    expect(wizard).toMatch(/onSeeResult=\{ctx\?\.onLitUp \? seeResult : null\}/)
  })

  it('"Done" is untouched — this is an extra door, not a redefinition', () => {
    // wizard-finish.spec pins Done → ?tab=records; a change there would break
    // every module, so the new path is its own function.
    expect(wizard).toMatch(/const finish = \(\) => \{/)
    expect(wizard).toMatch(/\?tab=records/)
    expect(wizard).toMatch(/const seeResult = \(\) => \{/)
  })
})
