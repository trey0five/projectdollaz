import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { MetricResult } from '@finrep/analytics'
import { MAX_INSIGHT_SIGNALS, insightTagOf, validateInsightReply } from './insight-reply.js'
import { NOT_ENOUGH_DATA, generateInsightSignals } from './insight-rule.js'
import { INSIGHT_CACHE_VERSION, InsightService } from './insight.service.js'

// ─────────────────────────────────────────────────────────────────────────────
// Review MUST (2026-10-15): the rule fallback must be TAGGED. The Finance page's
// Warnings grid tiles only [RISK]/[WATCH]/[STRENGTH] lines, so the old untagged
// rule prose ("Operating margin is a risk at -3.0% — …") rendered the green
// "Nothing flagged" empty state while a metric was at risk.
//
// The web parsers (apps/web toSignals + financeAurora warningTiles/realSignals)
// can't be imported here (`nest build` compiles specs; web isn't in the api's
// build context), so the contract is MIRRORED below with the regexes READ FROM
// THE WEB SOURCE at test time — if the web side changes its parser, this spec
// exercises the new one (or fails loudly if it can't find it).
// ─────────────────────────────────────────────────────────────────────────────

const here = dirname(fileURLToPath(import.meta.url))
const WEB = resolve(here, '../../../web/src')

function regexLiteral(file: string, name: string): RegExp {
  const src = readFileSync(resolve(WEB, file), 'utf8')
  const m = src.match(new RegExp(`const ${name}\\s*=\\s*\\/((?:\\\\.|[^/\\n])+)\\/([a-z]*)`))
  if (!m) throw new Error(`could not find ${name} in ${file} — the web signal parser moved`)
  return new RegExp(m[1], m[2])
}

const CAT_RE = regexLiteral('components/home/HomeHero.jsx', 'CAT_RE')
const NOT_A_FINDING = regexLiteral('components/finance/financeAurora.js', 'NOT_A_FINDING')
const SIGNAL_VERDICT: Record<string, string> = { risk: 'risk', watch: 'watch', strength: 'good' }

/** Mirror of apps/web toSignals (HomeHero.jsx). */
function toSignals(text: string): Array<{ category: string; text: string }> {
  if (!text) return []
  let items = text.split(/\n+/).map((s) => s.trim()).filter(Boolean)
  if (items.length <= 1) items = text.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean)
  return items
    .slice(0, 5)
    .map((raw) => {
      let t = raw.replace(/^[-•*]\s*/, '')
      const m = t.match(CAT_RE)
      let category = 'neutral'
      if (m) {
        const k = m[1].toLowerCase()
        category = k === 'risk' ? 'risk' : k === 'watch' ? 'watch' : 'strength'
        t = t.slice(m[0].length)
      }
      return { category, text: t.replace(/\s+/g, ' ').trim() }
    })
    .filter((s) => s.text)
}

/** Mirror of financeAurora warningTiles' filter (realSignals) → verdicts. */
function warningTiles(signals: Array<{ category: string; text: string }>): string[] {
  return signals
    .filter((sg) => SIGNAL_VERDICT[sg.category] != null && sg.text.trim() && !NOT_A_FINDING.test(sg.text.trim()))
    .map((sg) => SIGNAL_VERDICT[sg.category])
}

const metric = (over: Partial<MetricResult> = {}): MetricResult =>
  ({
    key: 'operating_margin',
    label: 'Operating margin',
    unit: 'percent',
    value: 0.04,
    available: true,
    status: 'good',
    goodDirection: 'higher',
    periodOverPeriodDelta: null,
    ...over,
  }) as unknown as MetricResult

const RISK_MARGIN = metric({ value: -0.03, status: 'risk' })

describe('generateInsightSignals — one tagged line per signal', () => {
  it('nothing available → the untagged "not enough data" line (→ empty state, not a tile)', () => {
    const text = generateInsightSignals([metric({ available: false, value: null })])
    expect(text).toBe(NOT_ENOUGH_DATA)
    expect(warningTiles(toSignals(text))).toEqual([])
  })

  it('a risk metric → a [RISK] line with generateInsight’s lead sentence', () => {
    expect(generateInsightSignals([RISK_MARGIN])).toBe(
      '[RISK] Operating margin is a risk at -3% — the top priority to address.',
    )
  })

  it('status drives the tag: risk → RISK, watch → WATCH, good → STRENGTH; worst first', () => {
    const text = generateInsightSignals([
      metric({ key: 'days_cash_on_hand' as never, label: 'Days cash on hand', unit: 'days', value: 120, status: 'good' }),
      metric({ key: 'tuition_dependency' as never, label: 'Tuition dependency', unit: 'share', value: 0.7, status: 'watch' }),
      RISK_MARGIN,
    ])
    const lines = text.split('\n')
    expect(lines.map(insightTagOf)).toEqual(['RISK', 'WATCH', 'STRENGTH'])
    expect(lines[2]).toBe('[STRENGTH] Days cash on hand is healthy at 120 days.')
  })

  it('flags tuition dependency above 80% even when its band says good', () => {
    const text = generateInsightSignals([
      metric({ key: 'tuition_dependency' as never, label: 'Tuition dependency', unit: 'share', value: 0.87, status: 'good' }),
    ])
    expect(text).toBe('[WATCH] Tuition dependency remains high at 87% — consider diversifying revenue.')
  })

  it('a slipping metric is a WATCH, an improving one a STRENGTH', () => {
    expect(generateInsightSignals([metric({ status: 'neutral', periodOverPeriodDelta: -0.02 })])).toBe(
      '[WATCH] Operating margin slipped by 2% to 4%.',
    )
    expect(generateInsightSignals([metric({ status: 'neutral', periodOverPeriodDelta: 0.02 })])).toBe(
      '[STRENGTH] Operating margin improved by 2% to 4%.',
    )
  })

  it('only neutral (unbanded) metrics, nothing moved → untagged prose (nothing flagged)', () => {
    const text = generateInsightSignals([metric({ status: 'neutral' })])
    expect(insightTagOf(text)).toBeNull()
    expect(warningTiles(toSignals(text))).toEqual([])
  })

  it('caps at MAX_INSIGHT_SIGNALS and passes the reply gate unchanged', () => {
    const many = Array.from({ length: 8 }, (_, i) =>
      metric({ key: `k${i}` as never, label: `Metric ${i}`, status: i % 2 ? 'risk' : 'watch' }),
    )
    const text = generateInsightSignals(many)
    expect(text.split('\n')).toHaveLength(MAX_INSIGHT_SIGNALS)
    expect(validateInsightReply(text)).toBe(text)
  })

  it('is deterministic', () => {
    const ms = [RISK_MARGIN, metric({ key: 'days_cash_on_hand' as never, label: 'Days cash on hand', unit: 'days', value: 40, status: 'watch' })]
    expect(generateInsightSignals(ms)).toBe(generateInsightSignals(ms))
  })
})

// ── The reviewer's scenario, end to end through the service ──────────────────

type Gen = { generate: (m: MetricResult[]) => Promise<{ text: string; source: string }> }
const serviceWith = (keys: Record<string, string>) =>
  new InsightService({} as never, { get: (k: string) => keys[k] } as never, {} as never, {} as never)

afterEach(() => vi.unstubAllGlobals())

describe('InsightService rule fallback → Finance Warnings tiles', () => {
  it('★ no LLM configured + one risk metric → warningTiles(toSignals(text)) has a risk tile', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const out = await (serviceWith({}) as unknown as Gen).generate([RISK_MARGIN])
    expect(fetchMock).not.toHaveBeenCalled()
    expect(out.source).toBe('rule')
    expect(warningTiles(toSignals(out.text))).toEqual(['risk'])
  })

  it('★ LLM reply rejected by the gate → the TAGGED rule fallback still shows the risk', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ choices: [{ message: { content: "I'll need information such as:" } }] }),
      })),
    )
    const out = await (serviceWith({ 'openrouter.apiKey': 'k' }) as unknown as Gen).generate([RISK_MARGIN])
    expect(out.source).toBe('rule')
    expect(warningTiles(toSignals(out.text))).toEqual(['risk'])
  })

  it('LLM throws → the tagged rule fallback', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500 })))
    const out = await (serviceWith({ 'openrouter.apiKey': 'k' }) as unknown as Gen).generate([RISK_MARGIN])
    expect(out.source).toBe('rule')
    expect(warningTiles(toSignals(out.text))).toEqual(['risk'])
  })

  it('cache version bumped so cached untagged rule prose is regenerated', () => {
    expect(INSIGHT_CACHE_VERSION).toBe('v5')
  })
})
