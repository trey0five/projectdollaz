import { afterEach, describe, expect, it, vi } from 'vitest'
import { AssistantTtsService, pronounceForSpeech, scrubSpokenText } from './assistant-tts.service.js'

// ─────────────────────────────────────────────────────────────────────────────
// Privacy F4 — spoken text is scrubbed before it leaves for the EXTERNAL TTS
// provider (ElevenLabs): emails and SSN-shaped runs are masked, and any
// residual `[[…]]` placeholder is STRIPPED so a mask token is never spoken
// aloud. The in-account Polly path is deliberately unscrubbed (no third party).
//
// HONEST LIMIT (documented in code + docs, not papered over here): this is not
// name detection — a name KYRO was asked to speak still reaches the provider;
// the mitigations are the account-level no-training opt-out (ops) and the
// no-penny-pii gate keeping names out of KYRO's own answers.
// ─────────────────────────────────────────────────────────────────────────────

describe('scrubSpokenText — the pure scrub', () => {
  it('masks emails and SSN-shaped runs, then strips the placeholder so it is never spoken', () => {
    const out = scrubSpokenText('Write to jane.parent@example.com about SSN 123-45-6789 today.')
    expect(out).not.toContain('jane.parent@example.com')
    expect(out).not.toContain('123-45-6789')
    expect(out, 'a spoken "[[EMAIL_1]]" is worse than silence').not.toContain('[[')
    expect(out).toContain('Write to')
    expect(out).toContain('today.')
  })

  it('strips a residual redaction token that leaked into a reply', () => {
    expect(scrubSpokenText('The balance for [[PARTY_1]] is $500.')).toBe('The balance for is $500.')
  })

  it('NESTED tokens leave no residue — the strip loops until stable (reviewer NIT)', () => {
    // One greedy pass over "[[a [[b]] c]]" eats up to the first "]]" and would
    // speak " c]]" aloud. Innermost-first + loop leaves nothing.
    const out = scrubSpokenText('Send [[NOTE [[EMAIL_1]] tail]] the report.')
    expect(out).not.toContain('[[')
    expect(out).not.toContain(']]')
    expect(out).toBe('Send the report.')
    // A token with a stray single bracket inside still goes.
    expect(scrubSpokenText('Hi [[X[Y]] there.')).toBe('Hi there.')
  })

  it('leaves ordinary narration untouched', () => {
    const text = 'Good morning! Cash on hand covers 43 days.'
    expect(scrubSpokenText(text)).toBe(text)
  })
})

describe('pronounceForSpeech — the assistant name is spoken as "Cairo"', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('rewrites whole-word KYRO only (speech text, never display text), and leaves figures alone', () => {
    expect(pronounceForSpeech("Hi, I'm KYRO. KYRO's brief covers 43 days of cash.")).toBe(
      "Hi, I'm Cairo. Cairo's brief covers 43 days of cash.",
    )
    // Not a whole word → untouched (no substring damage).
    expect(pronounceForSpeech('KYROX and xKYRO stay')).toBe('KYROX and xKYRO stay')
    // Case-sensitive: lowercase "kyro" is not the brand spelling.
    expect(pronounceForSpeech('kyro')).toBe('kyro')
  })

  it('★ the ElevenLabs payload says Cairo, not KYRO, alongside the scrub', async () => {
    const fetchMock = vi.fn(
      async (_url: string, _init?: { body: string }) =>
        ({ ok: true, arrayBuffer: async () => new ArrayBuffer(4) }) as unknown as Response,
    )
    vi.stubGlobal('fetch', fetchMock)
    const svc = new AssistantTtsService({
      get: (k: string) => ({ 'elevenlabs.apiKey': 'test-key' })[k],
    } as never)

    await svc.synthesize('KYRO here — email jane.parent@example.com about the invoice.')

    const body = JSON.parse(fetchMock.mock.calls[0][1]!.body) as { text: string }
    expect(body.text).toContain('Cairo here')
    expect(body.text).not.toContain('KYRO')
    expect(body.text).not.toContain('jane.parent@example.com')
  })

  it('★ the in-account Polly path receives Cairo too (the substitution sits ABOVE the provider fork)', async () => {
    const svc = new AssistantTtsService({
      get: (k: string) => ({ 'assistant.provider': 'bedrock' })[k],
    } as never)
    // The private provider seam: spy it so no AWS client is ever built. Parameters
    // declared so `mock.calls[0][0]` type-checks (the docker build compiles specs).
    const polly = vi
      .spyOn(svc as unknown as { pollySynthesize: (t: string, v?: string) => Promise<Buffer> }, 'pollySynthesize')
      .mockImplementation(async (_t: string, _v?: string) => Buffer.alloc(0))

    await svc.synthesize("Good morning — KYRO's brief covers 43 days of cash.")

    expect(polly).toHaveBeenCalledTimes(1)
    expect(polly.mock.calls[0][0]).toBe("Good morning — Cairo's brief covers 43 days of cash.")
    expect(polly.mock.calls[0][0]).not.toContain('KYRO')
  })
})

describe('AssistantTtsService — the ElevenLabs payload is scrubbed', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('★ an email in the TTS text arrives at the provider masked, with no [[…]] token in the payload', async () => {
    // Parameters DECLARED so `mock.calls[0][1]` type-checks (the docker image
    // build compiles specs, and an untyped mock has an empty call-args tuple).
    const fetchMock = vi.fn(
      async (_url: string, _init?: { body: string }) =>
        ({ ok: true, arrayBuffer: async () => new ArrayBuffer(4) }) as unknown as Response,
    )
    vi.stubGlobal('fetch', fetchMock)
    const svc = new AssistantTtsService({
      get: (k: string) => ({ 'elevenlabs.apiKey': 'test-key' })[k],
    } as never)

    await svc.synthesize('Please email jane.parent@example.com and [[PARTY_1]] about the invoice.')

    const body = JSON.parse(fetchMock.mock.calls[0][1]!.body) as { text: string }
    expect(body.text).not.toContain('jane.parent@example.com')
    expect(body.text).not.toContain('[[')
    expect(body.text).toContain('about the invoice.')
  })
})
