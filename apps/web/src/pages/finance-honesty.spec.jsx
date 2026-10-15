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

  it('the Aurora band above the first-run card follows the same signal', () => {
    // Saved-but-unreadable must not say "Your first year is in" — the card
    // right below it asks the user to sort the accounts, so the band would be
    // inviting them to an overview built from zeros.
    expect(page).toMatch(
      /savedPeriods\.length > 0\s*\?\s*statementsHaveNumbers\s*\?\s*'Your first year is in\. Open your overview whenever you like\.'\s*:\s*'Your books are saved, but we can’t read them yet\./,
    )
  })

  it('the hero explains the fix rather than just withholding praise', () => {
    // "We can't read this" with no next step is a dead end, not honesty.
    expect(page).toMatch(/sort the accounts below and your statements fill in/i)
  })

  it('the checkpoint offers no celebration when there is nothing to celebrate', () => {
    expect(embed).toMatch(/dataReady = true/)
    expect(embed).toMatch(/dataReady=\{dataReady\}/)
    expect(page).toMatch(/dataReady=\{statementsHaveNumbers\}/)
    // The confirm band swaps its whole call to action.
    expect(band).toMatch(/\{dataReady \? 'Does this look right\?' : 'Saved — but we can’t read it yet'\}/)
    // ONE action, ONE name: the same words as the Finance band and the callout.
    expect(band).toMatch(/\$\{needsCheckPhrase\(reviewCount\)\} before your statements fill in\./)
    expect(band).toMatch(/reviewButtonLabel\(reviewCount\)/)
    expect(band).not.toMatch(/Categori[sz]e my accounts/)
  })

  it('…and that call to action actually DOES something', () => {
    // THE BUG THIS FILE PREVIOUSLY MISSED. The previous assertion checked that
    // the button existed with the right words on it — and it was wired to
    // `onFix`, the band's dismiss handler. A user pressed the only button the
    // screen offered, watched it disappear, categorised nothing, and had no
    // figures anywhere: identical in appearance to the engine bug this whole
    // release is the cure for. A label is not a behaviour.
    // lastIndexOf: the phrase also appears in the prop's doc comment above.
    const at = band.lastIndexOf('reviewButtonLabel(reviewCount)')
    expect(at).toBeGreaterThan(-1)
    const handler = band.slice(band.lastIndexOf('onClick', at), at)
    expect(handler, 'the button is still just a dismiss').toContain('onCategorise')
    expect(band).toMatch(/onCategorise = null/)

    // …and the host turns that into a real, receivable request.
    expect(embed).toMatch(/onCategorise=\{\(\) => window\.dispatchEvent\(new CustomEvent\('finrep:open-review'\)\)\}/)

    // …which the intake's review popup host listens for, and only acts on when
    // there is something to sort. (A5: the review is ONE popup now — the file
    // cards, the Add-data callout and the Finance band all open the same one.
    // The event name lives in lib/reviewRequest.js since A4 made the ask
    // sticky across the Finance band → Add-data hop; it is the same event.)
    const hostSrc = read('components/intake/ReviewAccountsHost.jsx')
    expect(hostSrc).toMatch(/window\.addEventListener\(OPEN_REVIEW_EVENT, onOpenReview\)/)
    expect(read('lib/reviewRequest.js')).toMatch(/export const OPEN_REVIEW_EVENT = 'finrep:open-review'/)
    expect(hostSrc).toMatch(/if \(reviewCount === 0\) return/)
    expect(hostSrc).toMatch(/openReviewModal\(schoolId\)/)
    // …and the intake mounts that host for anyone who can edit.
    expect(read('components/IntakeBar.jsx')).toMatch(/\{canEdit && <ReviewAccountsHost \/>\}/)
  })

  it('the ADD-DATA TAB offers no celebration at all — it ends in ONE honest finish', () => {
    // Live-caught first: the wizard path asked "does this look right?" and
    // offered the celebration over thirty-three uncategorised accounts. Then
    // the owner (2026-10-15): the step ended in FOUR places and "Done" opened
    // half the overview. Now the trial-balance step mounts no confirm band —
    // it ends in the intake's one "Done — show my numbers" bar, which waits
    // (secondary, with the reason) while accounts still need review.
    const configs = read('components/wizard/wizardConfigs.jsx')
    const tbStart = configs.indexOf("key: 'tb'")
    const tb = configs.slice(tbStart, configs.indexOf("key: 'monthly'", tbStart))
    expect(tb).not.toMatch(/onConfirmed=/)
    expect(tb).toMatch(/ownFinish: true/)
    expect(tb).toMatch(/nav\.finishToOverview\(\)/)
    const bar = read('components/IntakeBar.jsx')
    expect(bar).toMatch(/if \(reviewTotal > 0\) return 'review'/)
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
    // Premium UI P2: FinanceHeader grew the period selector + insight props the
    // deleted second hero used to carry, so the signature is multi-line now;
    // the replay control is still the FIRST prop and still gated on numbers.
    expect(page).toMatch(/function FinanceHeader\(\{\s*onWhatLitUp = null,/)
    expect(page).toMatch(/onWhatLitUp && \(/)
    // Gated on numbers AND a year before them ("What changed" from what?).
    expect(page).toMatch(
      /onWhatLitUp=\{statementsHaveNumbers && basis !== null \? \(\) => setRevealSchoolId\(schoolId\) : null\}/,
    )
    // …and the board packet needs numbers.
    expect(page).toMatch(/boardPacket=\{statementsHaveNumbers\}/)
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

  it('"Done" keeps other modules on Records; Finance’s lands on the FULL overview', () => {
    // wizard-finish.spec pins Done → ?tab=records for the record modules.
    expect(wizard).toMatch(/const finish = \(\) => \{/)
    expect(wizard).toMatch(/\?tab=records/)
    expect(wizard).toMatch(/const seeResult = \(\) => \{/)
    expect(wizard).toMatch(/if \(config\.finishTo === 'overview'\) \{\s*\n\s*navigate\(pathname\)/)
    expect(read('components/wizard/wizardConfigs.jsx')).toMatch(/finishTo: 'overview'/)
  })
})

describe('Warnings never give a false all-clear (#3), and never hide a real risk (S4)', () => {
  it('warningsMode: unread → neutral; read + waiting + tiles → provisional; read + waiting, no tiles → waiting', async () => {
    const { warningsMode } = await import('../components/finance/financeAurora.js')
    // Nothing read (no figures, or a read that says it had nothing to read).
    expect(warningsMode({ hasNumbers: false, reviewCount: 3, tileCount: 2 })).toBe('unread')
    expect(
      warningsMode({ hasNumbers: true, insightText: 'Not enough data to summarize this period yet.', tileCount: 0 }),
    ).toBe('unread')
    // One trivial account unsorted must NOT hide a real cash risk.
    expect(warningsMode({ hasNumbers: true, reviewCount: 1, tileCount: 3 })).toBe('provisional')
    // …and with nothing tagged, no green all-clear while accounts wait.
    expect(warningsMode({ hasNumbers: true, reviewCount: 1, tileCount: 0 })).toBe('waiting')
    expect(warningsMode({ hasNumbers: true, reviewCount: 0, tileCount: 2 })).toBe('tiles')
    expect(warningsMode({ hasNumbers: true, reviewCount: 0, tileCount: 0 })).toBe('clear')
  })

  it('the page renders from it: pending = unread | waiting; provisional = tiles + a note', () => {
    expect(page).toMatch(/const wMode = warningsMode\(\{/)
    expect(page).toMatch(/const warningsProvisional = wMode === 'provisional'/)
    expect(page).toMatch(/const warningsPending = wMode === 'unread' \|\| wMode === 'waiting'/)
    expect(page).toMatch(/tone=\{warningsPending \? null : warnings\.length \? worst : 'good'\}/)
    expect(page).toMatch(/'Warnings show up once your accounts are sorted\.'/)
    const at = page.indexOf('data-testid="warnings-pending"')
    expect(at).toBeGreaterThan(-1)
    expect(page.slice(at, at + 900)).toMatch(/reviewButtonLabel\(reviewCount\)/)
  })

  it('REAL tiles still show while one account is unsorted, under a one-line note', () => {
    const tiles = page.indexOf(') : warnings.length ? (')
    const note = page.indexOf('data-testid="warnings-provisional"')
    const grid = page.indexOf('<AuroraTileGrid cols={Math.min(4, Math.max(2, warnings.length))} className="au-tiles-warn">')
    expect(tiles).toBeGreaterThan(-1)
    expect(note).toBeGreaterThan(tiles)
    expect(grid).toBeGreaterThan(note)
    expect(page.slice(tiles, note)).toMatch(/\{warningsProvisional && \(/)
    expect(page).toMatch(/These may change once \$\{reviewCount\} account\$\{reviewCount === 1 \? ' is' : 's are'\} sorted\./)
  })

  it('"Nothing flagged" is the last arm (pending → tiles → all-clear)', () => {
    const pending = page.indexOf('{warningsPending ? (')
    const nothing = page.indexOf('Nothing flagged for ${periodLabel}.')
    expect(pending).toBeGreaterThan(-1)
    expect(nothing).toBeGreaterThan(pending)
    expect(page.slice(pending, nothing)).toMatch(/\) : warnings\.length \? \(/)
  })
})

describe('Readiness never says "Good" over incomplete numbers', () => {
  it('unreadable, accounts waiting, or no Balance Sheet → "Not checked yet"', () => {
    expect(page).toMatch(
      /const dataIncomplete =\s*\n\s*!statementsHaveNumbers \|\|\s*\n\s*reviewCount > 0 \|\|\s*\n\s*Object\.values\(metricsByKey\)\.some\(\(m\) => balanceSheetGap\(m\) != null\)/,
    )
    expect(page).toMatch(/: dataIncomplete && material === 0 && reportable === 0\s*\n\s*\? 'Not checked yet — finish this year’s numbers first\.'/)
    expect(page).toMatch(/verdict=\{complianceSummary && !\(dataIncomplete && readinessTone === 'good'\) \? readinessTone : null\}/)
  })

  it('one name for tuition share, everywhere', async () => {
    const { SHORT_NAME } = await import('../components/finance/financeAurora.js')
    expect(SHORT_NAME.tuition_dependency).toBe('Tuition share of income')
    expect(page).toMatch(/'Tuition share of income'/)
  })
})
