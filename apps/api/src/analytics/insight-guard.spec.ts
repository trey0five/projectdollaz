import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_CHART, generateReports } from '@finrep/engine'
import { computeMetricsForPeriod, type MetricResult } from '@finrep/analytics'
import { allowedTokensFor, guardInsightLines, metricsMentioned } from './insight-guard.js'
import { generateInsightSignals, ruleSignalFor } from './insight-rule.js'
import { InsightService } from './insight.service.js'

// ─────────────────────────────────────────────────────────────────────────────
// Live UX review 2026-10-15:
//  MUST 4 — "Operating margin is positive but thin at 0.26% — Watch" beside a
//           25.8% Good card (the model read the raw 0.258 as a percent).
//  MUST 3 — a P&L-only year said "Days cash on hand is zero — immediate
//           liquidity crisis" about a metric that can't be measured.
// ─────────────────────────────────────────────────────────────────────────────

const metric = (over: Partial<MetricResult>): MetricResult =>
  ({
    key: 'operating_margin',
    label: 'Operating Margin',
    unit: 'percent',
    category: 'financial',
    value: 0.258,
    available: true,
    status: 'good',
    goodDirection: 'higher',
    periodOverPeriodDelta: null,
    inputsMissing: [],
    inputs: [],
    formula: '',
    description: '',
    ...over,
  }) as MetricResult

const MARGIN = metric({})
const TUITION = metric({ key: 'tuition_dependency', label: 'Tuition Dependency', value: 0.997, status: 'risk', goodDirection: 'lower' })
const DAYS_CASH_MISSING = metric({
  key: 'days_cash_on_hand',
  label: 'Days Cash on Hand',
  unit: 'days',
  value: null,
  available: false,
  status: 'neutral',
  reason: 'needs-balance-sheet',
})
const RESERVE_MISSING = metric({
  key: 'months_operating_reserve',
  label: 'Months of Operating Reserve',
  unit: 'months',
  value: null,
  available: false,
  status: 'neutral',
  reason: 'needs-balance-sheet',
})

describe('guardInsightLines — every figure and status must match its metric', () => {
  it('★ "thin at 0.26%" on a 25.8% Good margin → replaced by the rule sentence', () => {
    const out = guardInsightLines('[WATCH] Operating margin is positive but thin at 0.26%.', [MARGIN])
    expect(out.text).toBe('[STRENGTH] Operating Margin is healthy at 26%.')
    expect(out.replaced).toBe(1)
  })

  it('a line that quotes the card value and the right tag is kept verbatim', () => {
    const line = '[STRENGTH] Operating margin is a solid 25.8%, giving room to invest.'
    expect(guardInsightLines(line, [MARGIN]).text).toBe(line)
    // The rounded and prose forms are the same figure.
    expect(guardInsightLines('[STRENGTH] Operating margin is healthy at 26%.', [MARGIN]).text).toMatch(/26%/)
  })

  it('a right figure under the wrong tag, or a contradicting status word, is replaced', () => {
    expect(guardInsightLines('[RISK] Operating margin is 25.8%.', [MARGIN]).text).toBe(
      '[STRENGTH] Operating Margin is healthy at 26%.',
    )
    expect(guardInsightLines('[STRENGTH] Operating margin is thin at 25.8%.', [MARGIN]).replaced).toBe(1)
  })

  it('a sign flip is caught (−3.0% is not 3%) unless a word carries the sign', () => {
    const neg = metric({ value: -0.03, status: 'risk' })
    expect(guardInsightLines('[RISK] Operating margin is 3%.', [neg]).replaced).toBe(1)
    expect(guardInsightLines('[RISK] Operating margin is -3.0%, a structural gap.', [neg]).replaced).toBe(0)
    expect(guardInsightLines('[RISK] Operating margin shows a deficit of 3%.', [neg]).replaced).toBe(0)
  })

  it('★ P&L-only year: lines about days cash / reserves / liquidity are dropped, never spoken', () => {
    const metrics = [MARGIN, TUITION, DAYS_CASH_MISSING, RESERVE_MISSING]
    const reply = [
      '[RISK] Days cash on hand is zero — immediate liquidity crisis.',
      '[WATCH] Operating reserve covers 3.1 months.',
      '[WATCH] Liquidity is tight; monitor cash closely.',
      '[RISK] Tuition dependency is 99.7% of revenue, leaving little buffer.',
    ].join('\n')
    const out = guardInsightLines(reply, metrics)
    expect(out.text).toBe('[RISK] Tuition dependency is 99.7% of revenue, leaving little buffer.')
    expect(out.dropped).toBe(3)
    expect(out.text).not.toMatch(/cash|reserve|liquidity/i)
  })

  it('a figure on a line that names no metric is dropped; nothing checkable → null', () => {
    expect(guardInsightLines('[WATCH] Expenses grew 12% this year.', [MARGIN]).text).toBeNull()
    expect(guardInsightLines('[STRENGTH] The school is in good shape overall.', [MARGIN]).text).toBeNull()
  })

  it('one line per metric: a second line about the same metric is dropped', () => {
    const out = guardInsightLines(
      '[STRENGTH] Operating margin is healthy at 25.8%.\n[STRENGTH] Operating margin of 25.8% is strong.',
      [MARGIN],
    )
    expect(out.text?.split('\n')).toHaveLength(1)
  })

  it('"forecast operating margin" belongs to the forecast metric, not operating margin', () => {
    const fc = metric({ key: 'forecast_operating_margin', label: 'Forecast Operating Margin', value: 0.05 })
    expect(metricsMentioned('Forecast operating margin is 5.0%.', [MARGIN, fc]).map((m) => m.key)).toEqual([
      'forecast_operating_margin',
    ])
  })

  it('allowed tokens cover the card, prose and rule forms (and the movement)', () => {
    const t = allowedTokensFor(metric({ periodOverPeriodDelta: 0.021 }))
    for (const k of ['25.8%', '26%', '2.1', '2.1%']) expect(t.has(k)).toBe(true)
    expect(t.has('0.26%')).toBe(false)
  })

  it('ruleSignalFor uses the same sentence generateInsightSignals emits', () => {
    expect(generateInsightSignals([MARGIN])).toBe(ruleSignalFor(MARGIN))
  })
})

// ── Through the service: the prompt and the guard ───────────────────────────
type Gen = { generate: (m: MetricResult[]) => Promise<{ text: string; source: string }> }
const llmService = () =>
  new InsightService({} as never, { get: (k: string) => (k === 'openrouter.apiKey' ? 'k' : undefined) } as never, {} as never, {} as never)
const replyWith = (content: string) => {
  const fetchMock = vi.fn(async (_url: string, _init: { body: string }) => ({
    ok: true,
    json: async () => ({ choices: [{ message: { content } }] }),
  }))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}
afterEach(() => vi.unstubAllGlobals())

describe('InsightService — value-guarded LLM insight', () => {
  it('★ the prompt carries FORMATTED values (25.8%), never the raw fraction', async () => {
    const fetchMock = replyWith('[STRENGTH] Operating margin is healthy at 25.8%.')
    await (llmService() as unknown as Gen).generate([MARGIN])
    const body = JSON.parse(fetchMock.mock.calls[0][1].body) as { messages: Array<{ content: string }> }
    const prompt = body.messages[0].content
    expect(prompt).toContain('Operating Margin: 25.8%, status good')
    expect(prompt).not.toMatch(/0\.258/)
  })

  it('★ a misread LLM line reaches the user as the rule sentence', async () => {
    replyWith('[WATCH] Operating margin is positive but thin at 0.26%.')
    const out = await (llmService() as unknown as Gen).generate([MARGIN])
    expect(out.text).toBe('[STRENGTH] Operating Margin is healthy at 26%.')
    expect(out.text).not.toContain('0.26%')
  })

  it('★ P&L-only: the prompt omits days cash / reserve and the rule fallback never mentions them', async () => {
    const metrics = [MARGIN, TUITION, DAYS_CASH_MISSING, RESERVE_MISSING]
    const fetchMock = replyWith('[RISK] Days cash on hand is zero — immediate liquidity crisis.')
    const out = await (llmService() as unknown as Gen).generate(metrics)
    const prompt = (JSON.parse(fetchMock.mock.calls[0][1].body) as { messages: Array<{ content: string }> }).messages[0].content
    expect(prompt).not.toMatch(/Days Cash|Operating Reserve/)
    // Every LLM line was dropped → the tagged rule text, which has no cash line.
    expect(out.source).toBe('rule')
    expect(out.text).toMatch(/^\[RISK\] Tuition dependency remains high at 100%/)
    expect(out.text).not.toMatch(/cash|reserve/i)
  })
})

describe('end to end with the real engine + metrics: P&L-only year', () => {
  it('★ the rule fallback for a P&L-only save names no balance-sheet metric', () => {
    const bundle = generateReports({
      cyData: [
        { acct: 401, desc: 'Tuition', total: -900000 },
        { acct: 500, desc: 'Teacher salaries', total: 880000 },
      ] as never,
      pyData: [],
      auditData: [],
      school: { netAssetsBegin: 250000, pyNetAssetsBegin: 0, auditNetAssetsBegin: 0 },
      chart: DEFAULT_CHART,
    })
    const metrics = computeMetricsForPeriod({ current: bundle })
    const days = metrics.find((m) => m.key === 'days_cash_on_hand')
    expect(days).toMatchObject({ available: false, value: null, reason: 'needs-balance-sheet' })
    const text = generateInsightSignals(metrics)
    expect(text).not.toMatch(/cash|reserve/i)
    expect(text).toMatch(/\[(RISK|WATCH|STRENGTH)\]/)
  })
})
