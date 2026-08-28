import { describe, expect, it, vi } from 'vitest'
import type { User } from '@finrep/db'
import { BriefingNarrationService } from './briefing-narration.service.js'

// ─────────────────────────────────────────────────────────────────────────────
// Privacy F5 — belt-and-suspenders on the narration egress. Briefing items are
// metric-derived (low risk), but every outbound message string now passes
// redactText before the provider sees it, so an email/SSN that ever rode a
// briefing item's text cannot leave in the clear. Done in the SERVICE:
// narration.compose.ts and its spec are byte-unchanged, and this spec asserts
// the wire, not the composition.
// ─────────────────────────────────────────────────────────────────────────────

const USER = { id: 'user-1', email: 'head@school.test' } as unknown as User

function makeService() {
  const chat = vi.fn(async (_messages: unknown[], _tools: unknown[]) => ({
    role: 'assistant' as const,
    content: 'not json — forces the template fallback after the call under test',
  }))
  const client = { isConfigured: () => true, chat }
  const briefing = {
    getBriefing: vi.fn(async () => ({
      lens: 'owner',
      periodId: 'p1',
      label: 'FY 2026',
      generatedAt: '2026-08-26T08:00:00.000Z',
      summary: { total: 2, critical: 1, warn: 1, info: 0 },
      items: [
        {
          id: 'cash:runway',
          severity: 'critical',
          source: 'cash',
          title: 'Cash runway is 21 days',
          // The belt-and-suspenders case: free text carrying an email + SSN.
          why: 'Contact jane.parent@example.com re SSN 123-45-6789 before Friday.',
          link: '/cash-flow',
          dueDate: null,
          voice: null,
        },
        {
          id: 'enrollment:vs-plan',
          severity: 'warn',
          source: 'enrollment',
          title: 'Enrollment is 3.3% under plan',
          why: 'The gap is concentrated in kindergarten.',
          link: '/enrollment',
          dueDate: null,
          voice: null,
        },
      ],
    })),
  }
  const periods = {
    listPeriods: vi.fn(async () => [{ id: 'p1', hasSnapshot: true }]),
    getOwnedPeriod: vi.fn(async () => null),
  }
  const prisma = {
    membership: { findUnique: vi.fn(async () => ({ status: 'active', role: 'owner' })) },
  }
  const svc = new BriefingNarrationService(
    client as never,
    briefing as never,
    {} as never,
    periods as never,
    prisma as never,
  )
  return { svc, chat }
}

describe('briefing narration — outbound payload is redacted at the wire', () => {
  it('★ an email/SSN in a briefing item reaches the LLM client masked; the metric text survives verbatim', async () => {
    const { svc, chat } = makeService()
    const res = await svc.narrateSchool('school-1', USER, {} as never)

    expect(chat).toHaveBeenCalledTimes(1)
    const wire = JSON.stringify(chat.mock.calls[0][0])
    expect(wire).not.toContain('jane.parent@example.com')
    expect(wire).not.toContain('123-45-6789')
    expect(wire).toContain('[[EMAIL_')
    expect(wire).toContain('[[SSN]]')
    // Redaction, not rewriting: the actual briefing content still went out.
    expect(wire).toContain('Cash runway is 21 days')
    expect(wire).toContain('Enrollment is 3.3% under plan')

    // And the unparseable reply degraded to the template, exactly as before.
    expect(res.source).toBe('template')
    expect(res.segments.length).toBeGreaterThan(0)
  })
})
