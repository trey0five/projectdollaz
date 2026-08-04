import { describe, expect, it, vi } from 'vitest'
import { AdvisoryService } from './advisory.service.js'
import type { AdvisorySegmentSpec } from './advisory-compose.js'

// ─────────────────────────────────────────────────────────────────────────────
// AIC Phase J — MB-1 and the fallback proofs.
//
// No @nestjs/testing (apps/api does not have it, and a DI spec that reads
// `design:paramtypes` under vitest is VACUOUS — proved so in this repo). The
// service is constructed DIRECTLY with hand-built doubles, exactly as
// twin.controller.spec.ts does, so what is asserted is what actually runs.
//
// MB-1 IS THE CENTRAL CLAIM OF MODE B. "The model was never asked" is not a
// property of the text that came back — it is a property of the call that never
// happened, and the only way to assert it is to count interactions with the
// client. A spy that recorded ZERO calls is the proof; nothing about the returned
// payload could distinguish "never asked" from "asked and ignored".
//
// RED PROOFS (run):
//  MB-1 — remove the `specs.length === 0` early return from AdvisoryService.compose
//         → "expected 'spy' to be called 0 times, but got 1 time"
//  FB-1 — remove the try/catch around the client call
//         → the rejection escapes: "advisory boom" thrown out of compose()
//  FB-2 — return composeAdvisory(...) instead of templateComposition on unparseable
//         → still template here, so FB-2 additionally pins source/fallbackCount
// ─────────────────────────────────────────────────────────────────────────────

const SPECS: AdvisorySegmentSpec[] = [
  {
    id: 'stands',
    templateText: 'Readiness stands at 62% documented and 48% defensible.',
    sourceStrings: ['Readiness stands at 62% documented and 48% defensible.'],
  },
  {
    id: 'gaps',
    templateText: '3 standards have no evidence on file.',
    sourceStrings: ['3 standards have no evidence on file.'],
  },
]

function makeService(opts: {
  configured?: boolean
  chat?: (messages: unknown[], tools: unknown[]) => Promise<{ role: 'assistant'; content: string | null }>
  timeoutMs?: number
}) {
  const chat = vi.fn(
    opts.chat ??
      (async () => ({ role: 'assistant' as const, content: '{"segments":[]}' })),
  )
  const isConfigured = vi.fn(() => opts.configured ?? true)
  const client = { isConfigured, chat }
  const config = { get: vi.fn((k: string) => (k === 'assistant.advisoryTimeoutMs' ? opts.timeoutMs : undefined)) }
  const svc = new AdvisoryService(client as never, config as never)
  return { svc, chat, isConfigured }
}

describe('MB-1 — an empty spec list NEVER reaches the model', () => {
  it('returns the empty template composition without touching the client at all', async () => {
    const { svc, chat, isConfigured } = makeService({})
    const out = await svc.compose('B', 'leadership', [])
    expect(out).toEqual({
      mode: 'B',
      segments: [],
      templateFallbackCount: 0,
      source: 'template',
      // NOTHING was asked — distinct from 'a model spoke and every sentence was
      // thrown away'. The advisory card renders a provenance claim from this.
      modelCalled: false,
    })
    // ZERO calls — not "a call whose answer we discarded". Mode B's empty-attribution
    // branch is a guarantee about what we asked, not a filter over what we got back.
    expect(chat).toHaveBeenCalledTimes(0)
    // …and we did not even ask whether a model was available.
    expect(isConfigured).toHaveBeenCalledTimes(0)
  })

  it('a NON-empty spec list does reach the model — the guard above is not vacuous', () => {
    // Without this, MB-1 would pass on a service that never calls the LLM at all.
    return (async () => {
      const { svc, chat } = makeService({})
      await svc.compose('B', 'leadership', SPECS)
      expect(chat).toHaveBeenCalledTimes(1)
      // NO TOOLS, one turn, no retry.
      expect(chat.mock.calls[0][1]).toEqual([])
    })()
  })
})

describe('the LLM is never load-bearing — every failure degrades to the template', () => {
  it('no LLM configured ⇒ full template, client never called', async () => {
    const { svc, chat } = makeService({ configured: false })
    const out = await svc.compose('C', 'board', SPECS)
    expect(chat).toHaveBeenCalledTimes(0)
    expect(out.source).toBe('template')
    expect(out.templateFallbackCount).toBe(2)
    expect(out.segments.map((s) => s.text)).toEqual(SPECS.map((s) => s.templateText))
  })

  it('the client THROWING ⇒ full template, and compose does not reject', async () => {
    const { svc } = makeService({
      chat: async () => {
        throw new Error('advisory boom')
      },
    })
    const out = await svc.compose('C', 'leadership', SPECS)
    expect(out.source).toBe('template')
    expect(out.segments).toHaveLength(2)
    expect(out.segments.every((s) => s.source === 'template')).toBe(true)
  })

  it('a TIMEOUT ⇒ full template rather than a hung chat turn', async () => {
    const { svc } = makeService({
      timeoutMs: 5,
      chat: () => new Promise(() => {}) as never,
    })
    const out = await svc.compose('C', 'leadership', SPECS)
    expect(out.source).toBe('template')
    expect(out.mode).toBe('C')
  })

  it('unparseable text ⇒ full template', async () => {
    const { svc } = makeService({
      chat: async () => ({ role: 'assistant' as const, content: 'I am not going to answer that.' }),
    })
    const out = await svc.compose('C', 'leadership', SPECS)
    expect(out.source).toBe('template')
    expect(out.templateFallbackCount).toBe(2)
    // A MODEL DID SPEAK — it simply said nothing usable. The card must be able to
    // tell that apart from "nothing was asked", because it prints one of two
    // different provenance sentences from it.
    expect(out.modelCalled).toBe(true)
  })

  it('a THROWN or timed-out call is modelCalled:false — no reply ever reached us', async () => {
    // RED PROOF: pass `true` to templateComposition in the catch block — this reads
    // "expected true to be false", and the card would tell a reader a model was
    // consulted about sentences that never left the server.
    const { svc } = makeService({
      chat: async () => {
        throw new Error('advisory boom')
      },
    })
    const out = await svc.compose('C', 'leadership', SPECS)
    expect(out.source).toBe('template')
    expect(out.modelCalled).toBe(false)
  })

  it('no LLM configured is modelCalled:false', async () => {
    const { svc } = makeService({ configured: false })
    const out = await svc.compose('C', 'leadership', SPECS)
    expect(out.modelCalled).toBe(false)
  })

  it('a null content body ⇒ full template', async () => {
    const { svc } = makeService({ chat: async () => ({ role: 'assistant' as const, content: null }) })
    const out = await svc.compose('B', 'leadership', SPECS)
    expect(out.source).toBe('template')
  })
})

describe('the happy path still guards every segment', () => {
  it('keeps clean model text and drops the segment with the invented figure', async () => {
    const { svc } = makeService({
      chat: async () => ({
        role: 'assistant' as const,
        content: JSON.stringify({
          segments: [
            { id: 'stands', text: 'You are at 62% documented and 48% defensible.' },
            { id: 'gaps', text: '3 standards lack evidence, about 40% of the framework.' },
          ],
        }),
      }),
    })
    const out = await svc.compose('C', 'leadership', SPECS)
    expect(out.segments[0].source).toBe('llm')
    // "40%" was computed by nobody.
    expect(out.segments[1].source).toBe('template')
    expect(out.segments[1].text).not.toContain('40%')
    expect(out.templateFallbackCount).toBe(1)
    expect(out.source).toBe('llm')
  })

  it('the declared mode is always the one the caller asked for', async () => {
    const { svc } = makeService({})
    expect((await svc.compose('B', 'leadership', SPECS)).mode).toBe('B')
    expect((await svc.compose('C', 'board', SPECS)).mode).toBe('C')
  })
})
