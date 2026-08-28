import { afterEach, describe, expect, it, vi } from 'vitest'
import { AssistantClient } from './assistant.client.js'
import type { BedrockClient } from './bedrock.client.js'

// ─────────────────────────────────────────────────────────────────────────────
// Privacy F3 — every OpenRouter request carries the per-request retention
// controls, ON BY DEFAULT: `provider: { data_collection: 'deny', zdr: true }`.
// Field names verified against OpenRouter's provider-routing docs (2026-08):
// data_collection 'deny' excludes providers that store prompts; zdr restricts
// routing to Zero-Data-Retention endpoints and ORs with the account-wide ZDR
// setting (account-level enforcement stays an ops requirement — .env.example).
//
// FAIL CLOSED: a routing failure under the flags surfaces as an error naming
// them; there is no retry-without-flags path in the code to test for.
// ─────────────────────────────────────────────────────────────────────────────

type Cfg = Record<string, unknown>
const config = (over: Cfg = {}) =>
  ({
    get: (k: string) =>
      ({ 'openrouter.apiKey': 'test-key', 'assistant.provider': 'openrouter', ...over })[k],
  }) as never

const makeClient = (over: Cfg = {}) =>
  new AssistantClient(config(over), {} as unknown as BedrockClient)

function okJson() {
  return {
    ok: true,
    json: async () => ({ choices: [{ message: { role: 'assistant', content: 'ok' } }] }),
  } as unknown as Response
}

function okStream() {
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(new TextEncoder().encode('data: [DONE]\n\n'))
      c.close()
    },
  })
  return { ok: true, body } as unknown as Response
}

const sentBody = (fetchMock: ReturnType<typeof vi.fn>): Record<string, unknown> =>
  JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body)

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('AssistantClient — zero-data-retention flags on every OpenRouter call', () => {
  it('★ chat: the request body carries provider.data_collection="deny" and provider.zdr=true by DEFAULT', async () => {
    const fetchMock = vi.fn(async () => okJson())
    vi.stubGlobal('fetch', fetchMock)
    await makeClient().chat([{ role: 'user', content: 'hi' }], [])
    expect(sentBody(fetchMock).provider).toEqual({ data_collection: 'deny', zdr: true })
  })

  it('★ streamChat: same flags on the streaming body', async () => {
    const fetchMock = vi.fn(async () => okStream())
    vi.stubGlobal('fetch', fetchMock)
    await makeClient().streamChat([{ role: 'user', content: 'hi' }], [], () => {})
    const body = sentBody(fetchMock)
    expect(body.provider).toEqual({ data_collection: 'deny', zdr: true })
    expect(body.stream).toBe(true)
  })

  it('only an explicit assistant.llmZdr=false opts out (and then no provider block is sent)', async () => {
    const fetchMock = vi.fn(async () => okJson())
    vi.stubGlobal('fetch', fetchMock)
    await makeClient({ 'assistant.llmZdr': false }).chat([{ role: 'user', content: 'hi' }], [])
    expect(sentBody(fetchMock)).not.toHaveProperty('provider')
  })

  it('fails CLOSED: an upstream refusal surfaces an error naming the enforced flags — never a silent bare retry', async () => {
    const fetchMock = vi.fn(async () => ({ ok: false, status: 404 }) as unknown as Response)
    vi.stubGlobal('fetch', fetchMock)
    await expect(makeClient().chat([{ role: 'user', content: 'hi' }], [])).rejects.toThrow(
      /zero-data-retention flags are enforced/,
    )
    expect(fetchMock, 'exactly one request — no retry without the flags').toHaveBeenCalledTimes(1)
  })
})
