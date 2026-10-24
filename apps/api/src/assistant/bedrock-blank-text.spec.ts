import { describe, expect, it } from 'vitest'
import type { ConfigService } from '@nestjs/config'
import { BedrockClient } from './bedrock.client.js'

// Prod regression (2026-10-24): a file sent to KYRO with no typed message rides
// the history as content ''. The old ' ' placeholder was rejected by Converse
// ("text content blocks must contain non-whitespace text"), so that turn — and
// every later turn in the same chat — failed with "I hit an error answering that".

type Block = { text?: string; toolResult?: { content: { text: string }[] } }
type Converse = { msgs: { role: string; content: Block[] }[] }

const toConverse = (messages: unknown[]): Converse =>
  (new BedrockClient({ get: () => undefined } as unknown as ConfigService) as unknown as {
    toConverse: (m: unknown[]) => Converse
  }).toConverse(messages)

const allTexts = (c: Converse): string[] =>
  c.msgs.flatMap((m) =>
    m.content.flatMap((b) => [
      ...(b.text !== undefined ? [b.text] : []),
      ...(b.toolResult?.content.map((t) => t.text) ?? []),
    ]),
  )

describe('BedrockClient.toConverse — never sends a blank text block', () => {
  it('a file-only user turn in history, then a typed follow-up', () => {
    const c = toConverse([
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'Here is the income statement' },
      { role: 'assistant', content: 'Attach the balance sheet too.' },
      { role: 'user', content: '' },
      { role: 'assistant', content: 'Sorry — I hit an error answering that.' },
      { role: 'user', content: 'I just uploaded the balance sheet' },
    ])
    const texts = allTexts(c)
    expect(texts.every((t) => t.trim().length > 0)).toBe(true)
    expect(c.msgs.map((m) => m.role)).toEqual(['user', 'assistant', 'user', 'assistant', 'user'])
  })

  it('latest turn with attachment blocks and empty text', () => {
    const c = toConverse([
      { role: 'user', content: [{ type: 'image', source: {} }, { type: 'text', text: '  ' }] },
    ])
    expect(allTexts(c)).toEqual(['(sent an attachment with no message)'])
  })

  it('blank assistant content and blank tool results', () => {
    const c = toConverse([
      { role: 'user', content: 'hi' },
      {
        role: 'assistant',
        content: ' ',
        tool_calls: [{ id: 't1', function: { name: 'x', arguments: '{}' } }],
      },
      { role: 'tool', tool_call_id: 't1', content: '' },
      { role: 'assistant', content: '\n' },
    ])
    expect(allTexts(c).every((t) => t.trim().length > 0)).toBe(true)
  })
})
