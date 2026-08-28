import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { TASK_SOURCE_TYPES } from './dto/create-task.dto.js'

// ─────────────────────────────────────────────────────────────────────────────
// WS3 F2 — THE TWO-COPY EQUALITY GATE for TASK_SOURCE_TYPES.
//
// The assistant keeps its own hardcoded copy of this closed set as a CLAMP
// (assistant.service.ts) that silently downgrades an unknown sourceType to
// 'manual'. That silence is the trap: forgetting the duplicate list turns every
// Penny-created task of the new type into a 'manual' task with no error
// anywhere — the strategy-linked-task gotcha, live-caught once already. This
// spec pins the two lists EQUAL, element for element, in order.
// ─────────────────────────────────────────────────────────────────────────────

const HERE = fileURLToPath(new URL('.', import.meta.url))

function assistantClampList(): string[] {
  const src = readFileSync(HERE + '../assistant/assistant.service.ts', 'utf8')
  const m = /const TASK_SOURCE_TYPES = \[([^\]]+)\] as const/.exec(src)
  expect(m, 'assistant.service.ts TASK_SOURCE_TYPES clamp not found').toBeTruthy()
  return m![1]
    .split(',')
    .map((s) => s.trim().replace(/^'|'$/g, ''))
    .filter(Boolean)
}

describe('TASK_SOURCE_TYPES — the DTO and the assistant clamp move together', () => {
  it('the two copies are equal, element for element, in order', () => {
    expect(assistantClampList()).toEqual([...TASK_SOURCE_TYPES])
  })

  it("'accreditation' is a valid source type in both (the WS3 make-it-a-task hand-off)", () => {
    expect(TASK_SOURCE_TYPES).toContain('accreditation')
    expect(assistantClampList()).toContain('accreditation')
  })
})
