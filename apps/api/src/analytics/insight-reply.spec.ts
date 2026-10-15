import { afterEach, describe, expect, it, vi } from 'vitest'
import type { MetricResult } from '@finrep/analytics'
import {
  MAX_INSIGHT_SIGNALS,
  insightTagOf,
  isConversationalLine,
  validateInsightReply,
} from './insight-reply.js'
import { InsightService, hasAvailableMetric } from './insight.service.js'

// ─────────────────────────────────────────────────────────────────────────────
// A2 (owner live report 2026-10-15): with no readable numbers the AI insight
// replied conversationally and the Finance page showed it as five "warnings".
// Warnings must be REAL warnings: no LLM call without metrics, and a reply is
// accepted only as [RISK]/[WATCH]/[STRENGTH] signals — never a question or a
// request for information. Anything else falls back to the rule text.
// ─────────────────────────────────────────────────────────────────────────────

/** The reply the owner actually saw (shape reproduced; no school data in it). */
const LIVE_CHATTY_REPLY = [
  "I'm ready to help summarize your school's financial health for the board.",
  "However, I'll need information such as:",
  '- Revenue breakdown (tuition %, other sources)',
  '- Cash on hand and days of cash',
  '- Operating margin for the period',
].join('\n')

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

describe('validateInsightReply — only tagged signals survive', () => {
  it('★ the live conversational reply is rejected whole (→ rule fallback)', () => {
    expect(validateInsightReply(LIVE_CHATTY_REPLY)).toBeNull()
  })

  it('keeps a clean tagged reply, normalised one signal per line', () => {
    const out = validateInsightReply(
      '[RISK] Tuition dependency is 87% of revenue.\n[WATCH] Cash covers 43 days.\n[STRENGTH] Reserve covers seven months.',
    )
    expect(out).toBe(
      '[RISK] Tuition dependency is 87% of revenue.\n[WATCH] Cash covers 43 days.\n[STRENGTH] Reserve covers seven months.',
    )
  })

  it('drops untagged lines (a preamble, a bare bullet) but keeps the tagged ones', () => {
    const out = validateInsightReply(
      'Here are the signals.\n- [RISK] Operating margin is negative at -3%.\nRevenue breakdown (tuition %, other sources)',
    )
    expect(out).toBe('[RISK] Operating margin is negative at -3%.')
  })

  it('accepts bold / bare-colon tag spellings and normalises them to [TAG]', () => {
    expect(validateInsightReply('**[WATCH]** Days cash on hand fell to 61.')).toBe(
      '[WATCH] Days cash on hand fell to 61.',
    )
    expect(validateInsightReply('1. STRENGTH: Enrollment grew 4% year over year.')).toBe(
      '[STRENGTH] Enrollment grew 4% year over year.',
    )
  })

  it('a tagged QUESTION or tagged request for information poisons the reply', () => {
    expect(
      validateInsightReply('[RISK] Margin is -3%.\n[WATCH] Could you share your cash balance?'),
    ).toBeNull()
    expect(
      validateInsightReply('[RISK] Margin is -3%.\n[WATCH] Please provide the revenue breakdown.'),
    ).toBeNull()
    expect(
      validateInsightReply('[WATCH] No metrics were provided for this period yet.'),
    ).toBeNull()
  })

  it('only untagged text, an empty reply, or a bare tag → null', () => {
    expect(validateInsightReply('The school looks healthy overall.')).toBeNull()
    expect(validateInsightReply('')).toBeNull()
    expect(validateInsightReply(null)).toBeNull()
    expect(validateInsightReply('[RISK]\n[WATCH] —')).toBeNull()
  })

  it(`caps at ${MAX_INSIGHT_SIGNALS} signals`, () => {
    const many = Array.from({ length: 8 }, (_, i) => `[WATCH] Signal number ${i + 1} is here.`).join('\n')
    expect(validateInsightReply(many)!.split('\n')).toHaveLength(MAX_INSIGHT_SIGNALS)
  })

  it('helpers: tag detection and conversational detection', () => {
    expect(insightTagOf('[risk] x y z')).toBe('RISK')
    expect(insightTagOf('Revenue breakdown (tuition %)')).toBeNull()
    expect(isConversationalLine("I'll need information such as:")).toBe(true)
    expect(isConversationalLine('[RISK] Tuition dependency is 87% of revenue.')).toBe(false)
  })
})

// ── InsightService.generate — never asks the LLM without numbers ─────────────

type Gen = { generate: (m: MetricResult[]) => Promise<{ text: string; source: string }> }

const makeService = () => {
  const config = { get: (k: string) => ({ 'openrouter.apiKey': 'test-key' })[k as 'openrouter.apiKey'] }
  return new InsightService({} as never, config as never, {} as never, {} as never)
}

const replyWith = (content: string) =>
  vi.fn(
    async () =>
      ({ ok: true, json: async () => ({ choices: [{ message: { content } }] }) }) as unknown as Response,
  )

afterEach(() => vi.unstubAllGlobals())

describe('InsightService — the LLM path is gated', () => {
  it('★ no available metric → the LLM is NOT called; the rule text is returned', async () => {
    const fetchMock = replyWith('[RISK] should never be asked')
    vi.stubGlobal('fetch', fetchMock)
    const none = [metric({ available: false, value: null }), metric({ key: 'days_cash_on_hand' as never, available: false, value: null })]
    expect(hasAvailableMetric(none)).toBe(false)
    const out = await (makeService() as unknown as Gen).generate(none)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(out.source).toBe('rule')
    expect(out.text).toBe('Not enough data to summarize this period yet.')
  })

  it('★ a conversational LLM reply falls back to the rule text', async () => {
    vi.stubGlobal('fetch', replyWith(LIVE_CHATTY_REPLY))
    const out = await (makeService() as unknown as Gen).generate([metric()])
    expect(out.source).toBe('rule')
    expect(out.text).not.toMatch(/need information|ready to help|\?/)
  })

  it('a tagged LLM reply is kept (normalised)', async () => {
    vi.stubGlobal('fetch', replyWith('Signals:\n[STRENGTH] Operating margin is healthy at 4%.'))
    const out = await (makeService() as unknown as Gen).generate([metric()])
    expect(out).toEqual({ text: '[STRENGTH] Operating margin is healthy at 4%.', source: 'llm' })
  })
})

describe('InsightService.insightFor — a cached chatty reply is never served', () => {
  it('regenerates when the cached llm text fails the gate (same fingerprint)', async () => {
    const svc = makeService()
    // A 4% margin on WATCH — so the regenerated WATCH line also passes the value guard.
    const metrics = [metric({ status: 'watch' })]
    const fingerprint = (svc as unknown as { fingerprint: (m: MetricResult[]) => string }).fingerprint(metrics)
    const upsert = vi.fn(async () => ({}))
    ;(svc as unknown as { analytics: unknown }).analytics = {
      computeMetricsResponse: async () => ({ periodId: 'p1', metrics }),
    }
    ;(svc as unknown as { prisma: unknown }).prisma = {
      periodInsight: {
        findUnique: async () => ({ fingerprint, text: LIVE_CHATTY_REPLY, source: 'llm' }),
        upsert,
      },
    }
    vi.stubGlobal('fetch', replyWith('[WATCH] Operating margin is thin at 4%.'))
    const out = await svc.insightFor('s1', 'p1')
    expect(out).toEqual({ text: '[WATCH] Operating margin is thin at 4%.', source: 'llm' })
    expect(upsert).toHaveBeenCalledTimes(1)
  })
})
