import { afterEach, describe, expect, it, vi } from 'vitest'
import { InsightService } from './insight.service.js'

// ─────────────────────────────────────────────────────────────────────────────
// Privacy F3 (insight path) — the dashboard AI-insight's OpenRouter call sends
// the same per-request retention controls as AssistantClient: by default
// `provider: { data_collection: 'deny', zdr: true }`. A failure under the flags
// falls back to the rule-based insight (the service's existing behaviour) — it
// is never retried without them.
// ─────────────────────────────────────────────────────────────────────────────

type Cfg = Record<string, unknown>
const makeService = (over: Cfg = {}) => {
  const config = {
    get: (k: string) => ({ 'openrouter.apiKey': 'test-key', ...over })[k],
  }
  return new InsightService({} as never, config as never, {} as never, {} as never)
}

const callOpenRouter = (svc: InsightService): Promise<string | null> =>
  (
    svc as unknown as {
      callOpenRouter: (prompt: string, signal: AbortSignal) => Promise<string | null>
    }
  ).callOpenRouter('prompt', new AbortController().signal)

const sentBody = (fetchMock: ReturnType<typeof vi.fn>): Record<string, unknown> =>
  JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body)

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('InsightService — zero-data-retention flags on the OpenRouter call', () => {
  it('★ the request body carries provider.data_collection="deny" and provider.zdr=true by default', async () => {
    const fetchMock = vi.fn(
      async () =>
        ({
          ok: true,
          json: async () => ({ choices: [{ message: { content: '[RISK] x' } }] }),
        }) as unknown as Response,
    )
    vi.stubGlobal('fetch', fetchMock)
    await callOpenRouter(makeService())
    expect(sentBody(fetchMock).provider).toEqual({ data_collection: 'deny', zdr: true })
  })

  it('only an explicit assistant.llmZdr=false opts out', async () => {
    const fetchMock = vi.fn(
      async () =>
        ({
          ok: true,
          json: async () => ({ choices: [{ message: { content: '[RISK] x' } }] }),
        }) as unknown as Response,
    )
    vi.stubGlobal('fetch', fetchMock)
    await callOpenRouter(makeService({ 'assistant.llmZdr': false }))
    expect(sentBody(fetchMock)).not.toHaveProperty('provider')
  })
})
