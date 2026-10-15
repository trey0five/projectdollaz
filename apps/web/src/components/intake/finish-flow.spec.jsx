// ─────────────────────────────────────────────────────────────────────────────
// THE TRIAL-BALANCE STEP ENDS ONCE.
//
// Owner, 2026-10-15: "when I select I'm done on the trial balance screen, it
// takes me to a redundant screen making me press done again. when I press done
// it gives me half the overview screen … too much redundancy. lets make the
// process as easy and intuitive as possible."
//
// The step used to end in four places: a "Does this look right?" band (two
// buttons), a footer "I'm done", a Step 3 "That's saved" screen, and that
// screen's "Done" — which opened the Records tab (Workspaces only, "half the
// overview"). Pinned here:
//   • ONE bar: "Done — show my numbers" → the FULL Finance overview;
//   • it waits while a file reads / saves, and steps back (secondary, one line
//     why) while accounts need review — the amber "Review N accounts" is the
//     primary then;
//   • the trial-balance option has no wizard footer and no confirm band;
//   • every Finance "Done" lands on the overview; other modules keep Records.
// ─────────────────────────────────────────────────────────────────────────────
/* global process */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import IntakeFinishBar, { finishState, FINISH_LABEL } from './IntakeFinishBar.jsx'
import StatementNotes from './StatementNotes.jsx'
import { OPEN_ADD_YEARS_EVENT } from '../../lib/statementNotes.js'

let app = {}
vi.mock('../../context/AppContext.jsx', () => ({ useApp: () => app }))

const read = (rel) => readFileSync(resolve(process.cwd(), 'src', rel), 'utf8')
afterEach(() => cleanup())

describe('the one finish bar', () => {
  it('ready → ONE primary "Done — show my numbers" that finishes', () => {
    const onFinish = vi.fn()
    const onAddFile = vi.fn()
    render(<IntakeFinishBar state="ready" onFinish={onFinish} onAddFile={onAddFile} />)
    const btn = screen.getByTestId('finish-button')
    expect(btn.textContent).toBe(FINISH_LABEL)
    expect(FINISH_LABEL).toBe('Done — show my numbers')
    expect(btn.className).toMatch(/btn-primary/)
    expect(screen.queryByTestId('finish-reason')).toBeNull()
    fireEvent.click(btn)
    expect(onFinish).toHaveBeenCalledTimes(1)
    // A small, quiet "Add another file" — not a competing finish.
    const add = screen.getByTestId('finish-add-file')
    expect(add.textContent).toBe('Add another file')
    expect(add.className).toMatch(/btn-quiet/)
    fireEvent.click(add)
    expect(onAddFile).toHaveBeenCalledTimes(1)
  })

  it('saving → the same button, waiting', () => {
    const onFinish = vi.fn()
    render(<IntakeFinishBar state="saving" onFinish={onFinish} />)
    const btn = screen.getByTestId('finish-button')
    expect(btn.disabled).toBe(true)
    expect(btn.textContent).toBe('Saving…')
    fireEvent.click(btn)
    expect(onFinish).not.toHaveBeenCalled()
  })

  it('accounts waiting → secondary, with ONE line saying why (no second review button)', () => {
    render(<IntakeFinishBar state="review" reviewCount={9} onFinish={() => {}} />)
    expect(screen.getByTestId('finish-button').className).toMatch(/btn-secondary/)
    expect(screen.getByTestId('finish-reason').textContent).toBe(
      '9 accounts need a quick check — they’re left out of your numbers until they’re sorted.',
    )
    expect(screen.queryByText(/^Review /)).toBeNull()
    expect(finishState('review', 1).reason).toBe(
      '1 account needs a quick check — it’s left out of your numbers until it’s sorted.',
    )
  })

  it('a tab with its own primary keeps the finish secondary', () => {
    render(<IntakeFinishBar state="ready" primary={false} onFinish={() => {}} />)
    expect(screen.getByTestId('finish-button').className).toMatch(/btn-secondary/)
  })
})

describe('which state the intake is in', () => {
  it('saving beats review; nothing is "ready" without this year’s file', async () => {
    const { intakeFinishState } = await import('../IntakeBar.jsx')
    expect(intakeFinishState({ hasCurrent: false, parsing: false, saving: false, reviewTotal: 0 })).toBe('incomplete')
    expect(intakeFinishState({ hasCurrent: true, parsing: true, saving: false, reviewTotal: 3 })).toBe('saving')
    expect(intakeFinishState({ hasCurrent: true, parsing: false, saving: true, reviewTotal: 3 })).toBe('saving')
    expect(intakeFinishState({ hasCurrent: true, parsing: false, saving: false, reviewTotal: 3 })).toBe('review')
    expect(intakeFinishState({ hasCurrent: true, parsing: false, saving: false, reviewTotal: 0 })).toBe('ready')
  })

  it('the intake renders the bar only when its host asked for a finish', () => {
    const bar = read('components/IntakeBar.jsx')
    expect(bar).toMatch(/\{canEdit && onFinish && \(\s*\n\s*<IntakeFinishBar/)
    // While the bar is there, the green "all sorted" callout drops "See Finance".
    expect(bar).toMatch(/showFinanceLink=\{!confirmBandShowing && !onFinish\}/)
  })
})

describe('the wizard: no Step 3 for the trial balance, every Finance "Done" → overview', () => {
  const wizard = read('components/wizard/AddDataWizard.jsx')

  it('an ownFinish embed gets no footer ("I’m done") and no "03 Done" on the rail', async () => {
    expect(wizard).toMatch(/option\.kind === 'embed' && !needsPeriodBlocked && !option\.ownFinish \?/)
    expect(wizard).toMatch(/const skipDone = step === 'work' && !!option\?\.ownFinish/)
    expect(wizard).toMatch(/skipDone=\{skipDone\}/)
    const { default: WizardStepper } = await import('../wizard/WizardStepper.jsx')
    render(<WizardStepper current="work" panelId="p" onGoTo={() => {}} skipDone />)
    const tabs = screen.getAllByRole('tab').map((t) => t.textContent)
    expect(tabs).toHaveLength(2)
    expect(tabs[1]).toMatch(/Add/)
    expect(tabs.some((t) => /Done/.test(t))).toBe(false)
  })

  it('finishToOverview skips Step 3 and opens the module overview (not ?tab=records)', () => {
    const start = wizard.indexOf('const finishToOverview = () => {')
    expect(start).toBeGreaterThan(-1)
    const body = wizard.slice(start, wizard.indexOf('\n  }', start))
    expect(body).toMatch(/navigate\(pathname\)/)
    expect(body).not.toMatch(/setStep\('confirm'\)/)
    expect(body).not.toMatch(/tab=records/)
    expect(wizard).toMatch(/extra=\{\{ goToOption, finishToOverview \}\}/)
  })

  it('the Finance trial balance finishes itself: selects the saved year, then the overview', async () => {
    const { wizardConfigs } = await import('../wizard/wizardConfigs.jsx')
    expect(wizardConfigs.finance.finishTo).toBe('overview')
    const tb = wizardConfigs.finance.options.find((o) => o.key === 'tb')
    expect(tb.ownFinish).toBe(true)
    const onFinished = vi.fn()
    const finishToOverview = vi.fn()
    const el = tb.renderEmbed(
      { school: { id: 's1' }, activePeriod: { id: 'p26' }, canEdit: true, onFinished, onLitUp: vi.fn() },
      { goToOption: vi.fn(), finishToOverview },
    )
    // No confirm band in this path — the finish IS the checkpoint.
    expect(el.props.onConfirmed).toBeUndefined()
    el.props.onFinish()
    expect(onFinished).toHaveBeenCalledWith('p26')
    expect(finishToOverview).toHaveBeenCalledTimes(1)
    // Other modules keep their own Step 3 / Records landing.
    expect(wizardConfigs.enrollment.finishTo).toBeUndefined()
  })

  it('Finance hands the saved year to the overview and reloads its figures', () => {
    const page = read('pages/FinancePage.jsx')
    expect(page).toMatch(/onFinished=\{\(periodId\) => \{\s*\n\s*if \(periodId\) setSelectedPeriodId\(periodId\)/)
    // …and a school's first year doesn't land back on the first-run screen.
    const at = page.indexOf('onFinished={(periodId) => {')
    expect(page.slice(at, at + 600)).toMatch(/setFirstRunSchoolId\(null\)/)
    expect(page.slice(at, at + 600)).toMatch(/reloadMetrics\(\)/)
  })
})

describe('the file card’s statement actions', () => {
  it('"Add its Balance Sheet" loads the file into THIS card’s slot', () => {
    const onAddHalf = vi.fn()
    const file = {
      id: 'pl',
      status: 'ready',
      role: 'cy',
      metadata: { statement: { partial: 'pl' } },
      warnings: [],
    }
    const { container } = render(<StatementNotes file={file} canEdit onAddHalf={onAddHalf} />)
    const input = container.querySelector('[data-testid="add-half-input"]')
    const click = vi.spyOn(input, 'click').mockImplementation(() => {})
    fireEvent.click(screen.getByRole('button', { name: 'Add its Balance Sheet' }))
    expect(click).toHaveBeenCalledTimes(1)
    const f = new File(['x'], 'Balance Sheet 6-30-26.xlsx')
    fireEvent.change(input, { target: { files: [f] } })
    expect(onAddHalf).toHaveBeenCalledTimes(1)
    expect(onAddHalf.mock.calls[0][0]).toBe('cy')
  })

  it('the card resolves the slot it OCCUPIES, not the file’s classified role', () => {
    const card = read('components/FileStatusCard.jsx')
    expect(card).toMatch(/const slotRole = \['cy', 'py', 'audit'\]\.find\(\(r\) => byRole\?\.\[r\]\?\.id === file\.id\)/)
    expect(card).toMatch(/loadFilesForRole\(slotRole \?\? role, list\)/)
  })

  it('"Open Add years" (a workbook with more statements) asks the step to switch tabs', () => {
    const file = {
      id: 'wb',
      status: 'ready',
      role: 'cy',
      warnings: [],
      metadata: { statement: { partial: 'full', workbook: { statements: 3, used: ['P&L FY26', 'Balance Sheet'], unused: ['P&L Jan 2026'] } } },
    }
    const heard = vi.fn()
    window.addEventListener(OPEN_ADD_YEARS_EVENT, heard)
    render(
      <MemoryRouter>
        <StatementNotes file={file} canEdit />
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Open Add years' }))
    window.removeEventListener(OPEN_ADD_YEARS_EVENT, heard)
    expect(heard).toHaveBeenCalledTimes(1)
    expect(read('components/datahub/TrialBalanceModalBody.jsx')).toMatch(
      /window\.addEventListener\(OPEN_ADD_YEARS_EVENT, onOpenYears\)/,
    )
  })
})

describe('N1 — finishing after a failed autosave', () => {
  it('opens the year THIS save wrote (not the stale pre-save period)', async () => {
    const { runFinish } = await import('../IntakeBar.jsx')
    const onFinish = vi.fn()
    const save = vi.fn(async () => ({ fiscalPeriodId: 'p-new-fy27' }))
    const err = await runFinish({ dirty: true, canGenerate: true, save, onFinish })
    expect(err).toBeNull()
    expect(save).toHaveBeenCalledTimes(1)
    expect(onFinish).toHaveBeenCalledWith({ periodId: 'p-new-fy27' })
  })

  it('a save that fails or THROWS keeps the person here, in plain words', async () => {
    const { runFinish, FINISH_SAVE_ERROR } = await import('../IntakeBar.jsx')
    const onFinish = vi.fn()
    expect(await runFinish({ dirty: true, canGenerate: true, save: async () => null, onFinish })).toBe(FINISH_SAVE_ERROR)
    expect(
      await runFinish({
        dirty: true,
        canGenerate: true,
        save: async () => {
          throw new Error('Network Error')
        },
        onFinish,
      }),
    ).toBe(FINISH_SAVE_ERROR)
    expect(FINISH_SAVE_ERROR).not.toMatch(/Network|Error/)
    expect(onFinish).not.toHaveBeenCalled()
  })

  it('nothing owed → finishes without saving; the host falls back to its own period', async () => {
    const { runFinish } = await import('../IntakeBar.jsx')
    const onFinish = vi.fn()
    const save = vi.fn()
    await runFinish({ dirty: false, canGenerate: true, save, onFinish })
    expect(save).not.toHaveBeenCalled()
    expect(onFinish).toHaveBeenCalledWith(undefined)
    const { wizardConfigs } = await import('../wizard/wizardConfigs.jsx')
    const tb = wizardConfigs.finance.options.find((o) => o.key === 'tb')
    const onFinished = vi.fn()
    const el = tb.renderEmbed(
      { school: { id: 's1' }, activePeriod: { id: 'p-old' }, canEdit: true, onFinished },
      { goToOption: vi.fn(), finishToOverview: vi.fn() },
    )
    el.props.onFinish({ periodId: 'p-new' })
    expect(onFinished).toHaveBeenLastCalledWith('p-new')
    el.props.onFinish()
    expect(onFinished).toHaveBeenLastCalledWith('p-old')
  })

  it('the bar never hands a click event to onFinish', () => {
    const onFinish = vi.fn()
    render(<IntakeFinishBar state="ready" onFinish={onFinish} />)
    fireEvent.click(screen.getByTestId('finish-button'))
    expect(onFinish).toHaveBeenCalledWith()
  })
})

describe('MUST 2 — Done never drops an unsaved upload', () => {
  it('a This-year file read but not saved (no year-end date) → disabled, with the reason', async () => {
    const { intakeFinishState } = await import('../IntakeBar.jsx')
    const st = intakeFinishState({
      hasCurrent: true,
      parsing: false,
      saving: false,
      reviewTotal: 0,
      unsaved: true,
      canSave: false,
      hasDate: false,
    })
    expect(st).toBe('needsDate')
    const onFinish = vi.fn()
    render(<IntakeFinishBar state={st} onFinish={onFinish} />)
    const btn = screen.getByTestId('finish-button')
    expect(btn.disabled).toBe(true)
    expect(screen.getByTestId('finish-reason').textContent).toBe('Add the year-end date below so we can save this file.')
    fireEvent.click(btn)
    expect(onFinish).not.toHaveBeenCalled()
  })

  it('a role conflict blocks the save → disabled too; nothing at all → disabled', async () => {
    const { intakeFinishState } = await import('../IntakeBar.jsx')
    expect(
      intakeFinishState({ hasCurrent: true, parsing: false, saving: false, reviewTotal: 0, unsaved: true, canSave: false, hasDate: true }),
    ).toBe('blocked')
    expect(finishState('blocked').disabled).toBe(true)
    expect(finishState('incomplete').disabled).toBe(true)
    // A saved year with a date is finishable.
    expect(
      intakeFinishState({ hasCurrent: true, parsing: false, saving: false, reviewTotal: 0, unsaved: false, canSave: true, hasDate: true }),
    ).toBe('ready')
  })

  it('the intake feeds the bar its date and save state', () => {
    const bar = read('components/IntakeBar.jsx')
    expect(bar).toMatch(/unsaved: dirty,\s*\n\s*canSave: canGenerate,\s*\n\s*hasDate: !!periodDate,/)
  })
})

describe('MUST 3 — half a trial balance: its other half is the PRIMARY action', () => {
  it('This year is a P&L only → "Add its Balance Sheet" primary, Done secondary with why', async () => {
    const { intakeFinishState } = await import('../IntakeBar.jsx')
    const st = intakeFinishState({ hasCurrent: true, parsing: false, saving: false, reviewTotal: 3, half: 'pl' })
    expect(st).toBe('half')
    const onAddHalf = vi.fn()
    render(<IntakeFinishBar state={st} half="pl" onAddHalf={onAddHalf} onFinish={() => {}} onAddFile={() => {}} />)
    const add = screen.getByTestId('finish-add-half')
    expect(add.textContent).toBe('Add its Balance Sheet')
    expect(add.className).toMatch(/btn-primary/)
    expect(screen.getByTestId('finish-button').className).toMatch(/btn-secondary/)
    expect(screen.getByTestId('finish-reason').textContent).toMatch(/only the Profit and Loss — cash and reserve need its Balance Sheet/)
    // The generic "Add another file" steps aside for the specific one.
    expect(screen.queryByTestId('finish-add-file')).toBeNull()
    fireEvent.click(add)
    expect(onAddHalf).toHaveBeenCalledTimes(1)
    // …and it loads into THIS year's slot.
    expect(read('components/IntakeBar.jsx')).toMatch(/onAddHalf=\{\(\) => overrideRef\.current\?\.\('cy'\)\}/)
  })

  it('a balance-sheet metric with no Balance Sheet reads "Needs your Balance Sheet" and the band says why', async () => {
    const { balanceSheetGap, financeVerdict } = await import('../finance/financeAurora.js')
    expect(balanceSheetGap({ key: 'days_cash_on_hand', available: false, reason: 'needs-balance-sheet' })).toMatchObject({
      value: 'Needs your Balance Sheet',
    })
    expect(balanceSheetGap({ available: true, value: 152 })).toBeNull()
    expect(balanceSheetGap({ available: false })).toBeNull()
    const v = financeVerdict({
      periodLabel: 'FY 2026',
      periodEndDate: '2026-06-30',
      change: 62700,
      today: new Date('2026-10-15'),
      metrics: [
        { key: 'operating_margin', available: true, status: 'good' },
        { key: 'days_cash_on_hand', available: false, reason: 'needs-balance-sheet' },
      ],
    })
    expect(v.em).toBe('$62,700 ahead')
    expect(v.tail).toBe('The Balance Sheet is missing, so cash and reserve can’t be worked out yet.')
    expect(v.tail).not.toMatch(/healthy/)
    const page = read('pages/FinancePage.jsx')
    expect(page).toMatch(/const gap = vitalsLoading \? null : balanceSheetGap\(m\)/)
    expect(page).toMatch(/to: gap\.action === 'Review' && canEdit \? REVIEW_HREF : addDataHref\(uiV2, \{ add: 'tb' \}\)/)
  })
})

describe('MUST 5 — Done lands on the overview’s headline', () => {
  it('every finish to the overview scrolls to the top', async () => {
    const wizard = read('components/wizard/AddDataWizard.jsx')
    const start = wizard.indexOf('const finishToOverview = () => {')
    expect(wizard.slice(start, wizard.indexOf('\n  }', start))).toMatch(/navigate\(pathname\)\s*\n[\s\S]*scrollToTop\(\)/)
    expect(wizard).toMatch(/if \(config\.finishTo === 'overview'\) \{\s*\n\s*navigate\(pathname\)\s*\n\s*scrollToTop\(\)/)
    const { scrollToTop } = await import('../wizard/AddDataWizard.jsx')
    const main = document.createElement('main')
    document.body.appendChild(main)
    Object.defineProperty(main, 'scrollTop', { value: 420, writable: true })
    const spy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    scrollToTop()
    expect(spy).toHaveBeenCalledWith({ top: 0, left: 0, behavior: 'auto' })
    expect(main.scrollTop).toBe(0)
    spy.mockRestore()
    main.remove()
  })
})

describe('the owl never sits on a primary button', () => {
  it('the finish, add-half, review and band buttons are avoid zones KYRO rises above', () => {
    expect(read('components/intake/IntakeFinishBar.jsx').match(/data-kyro-avoid=""/g)).toHaveLength(2)
    expect(read('components/IntakeBar.jsx')).toMatch(/data-testid="review-now"\s*\n\s*data-kyro-avoid=""/)
    expect(read('pages/FinancePage.jsx')).toMatch(/data-testid="band-review-button"\s*\n\s*data-kyro-avoid=""/)
    const penny = read('components/penny/Penny.jsx')
    expect(penny).toMatch(/document\.querySelectorAll\('\[data-kyro-avoid\]'\)/)
    expect(penny).toMatch(/style=\{\{ bottom: HOME_Y \+ homeLift/)
    expect(penny).toMatch(/const homeT = vh - HOME_Y - homeLift - H/)
  })
})
