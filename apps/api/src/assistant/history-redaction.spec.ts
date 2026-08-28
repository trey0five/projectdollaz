import { describe, expect, it, vi } from 'vitest'
import type { User } from '@finrep/db'
import { AssistantService } from './assistant.service.js'

// ─────────────────────────────────────────────────────────────────────────────
// Privacy F2 — the client-supplied chat HISTORY is redacted before it reaches
// the provider. Tool results were already tokenized; the transcript itself was
// the residual gap: an email or SSN the user typed rode `history` verbatim into
// the request body on both the buffered and the streaming path.
//
// redactText is NOT name detection (a free-form name is not a registered
// identity) — that limit is stated in the system prompt and the docs; what IS
// guaranteed, and asserted here, is that emails and SSN-shaped runs never leave
// in the clear.
// ─────────────────────────────────────────────────────────────────────────────

const USER = { id: 'user-1', email: 'head@school.test' } as unknown as User

function makeService() {
  const arity = AssistantService.length
  const args: unknown[] = Array(arity).fill({} as never)
  const svc = new (AssistantService as unknown as new (...a: unknown[]) => AssistantService)(...args)
  const chat = vi.fn(async (_messages: unknown[], _tools: unknown[]) => ({
    role: 'assistant' as const,
    content: 'All set.',
  }))
  const streamChat = vi.fn(
    async (_messages: unknown[], _tools: unknown[], _onDelta: (t: string) => void) => ({
      role: 'assistant' as const,
      content: 'All set.',
    }),
  )
  // Post-construction stubs by NAME, not position (see roster-summary spec).
  Object.assign(svc as unknown as Record<string, unknown>, {
    client: { isConfigured: () => true, chat, streamChat },
    prisma: {
      membership: {
        findUnique: vi.fn(async () => ({ status: 'active', role: 'owner' })),
      },
    },
    config: { get: () => undefined }, // ferpaMode defaults ON
    systemPrompt: vi.fn(async () => 'SYSTEM'),
  })
  return { svc, chat, streamChat }
}

const HISTORY = [
  { role: 'user' as const, content: 'Please email jane.parent@example.com about the SSN 123-45-6789 on file.' },
  { role: 'assistant' as const, content: 'Noted: jane.parent@example.com.' },
  { role: 'user' as const, content: 'Thanks!' },
]

function sentBody(calls: unknown[][]): string {
  return JSON.stringify(calls[0][0])
}

describe('assistant chat — history is redacted before the provider sees it', () => {
  it('★ buffered path: the email and SSN in history reach the client masked', async () => {
    const { svc, chat } = makeService()
    await svc.chat('school-1', 'period-1', HISTORY, USER)
    const body = sentBody(chat.mock.calls as unknown as unknown[][])
    expect(body).not.toContain('jane.parent@example.com')
    expect(body).not.toContain('123-45-6789')
    expect(body).toContain('[[EMAIL_')
    expect(body).toContain('[[SSN]]')
    // The rest of the turn survives verbatim — redaction, not rewriting.
    expect(body).toContain('about the SSN')
    expect(body).toContain('Thanks!')
  })

  it('★ streaming path: same guarantee', async () => {
    const { svc, streamChat } = makeService()
    const events: unknown[] = []
    await svc.chatStream('school-1', 'period-1', HISTORY, (ev) => events.push(ev), USER)
    const body = sentBody(streamChat.mock.calls as unknown as unknown[][])
    expect(body).not.toContain('jane.parent@example.com')
    expect(body).not.toContain('123-45-6789')
    expect(body).toContain('[[EMAIL_')
    expect(body).toContain('[[SSN]]')
  })

  it('the SAME request-scoped redactor serves history and answer — a masked email is restored for the caller', async () => {
    const { svc } = makeService()
    ;(
      svc as unknown as { client: { chat: unknown } }
    ).client.chat = vi.fn(async () => ({
      role: 'assistant',
      content: 'I will write to [[EMAIL_1]] today.',
    }))
    const reply = await svc.chat('school-1', 'period-1', HISTORY, USER)
    expect(reply.answer).toBe('I will write to jane.parent@example.com today.')
  })
})
