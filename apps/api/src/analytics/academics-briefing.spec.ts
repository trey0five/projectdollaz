import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const briefing = readFileSync(join(here, 'briefing.service.ts'), 'utf-8')
const assistantDir = join(here, '..', 'assistant')
const tools = readFileSync(join(assistantDir, 'assistant.tools.ts'), 'utf-8')
const service = readFileSync(join(assistantDir, 'assistant.service.ts'), 'utf-8')

/**
 * STEP 2.17 and the three academics assistant tools carry the same two
 * obligations every other domain has, and this file pins BOTH by reading the
 * source — the fail direction and the FERPA shape are the kind of thing that
 * survives a careless edit only if something asserts on it.
 */
describe('academics briefing + assistant — the two rules', () => {
  it('the module gate fails CLOSED (a billing hiccup hides items, never leaks them)', () => {
    expect(briefing).toContain("isEntitledForModule(schoolId, 'academics').catch(() => false)")
  })

  it('the data read fails SOFT (a query error yields no items, never a 500)', () => {
    // readAcademicRows returns null on error and the step guards on Array.isArray.
    const reader = briefing.slice(briefing.indexOf('private async readAcademicRows'))
    expect(reader.slice(0, 600)).toContain('.catch(() => null)')
    expect(briefing).toContain('if (academicsLicensed && Array.isArray(academicRows))')
  })

  it('the briefing reads ONLY the aggregate table — the one with no identity column', () => {
    const reader = briefing.slice(
      briefing.indexOf('private async readAcademicRows'),
      briefing.indexOf('private async readAgingRow'),
    )
    expect(reader).toContain('assessmentSchoolAggregate')
    // The two tables that hold identity must never appear in the briefing at all.
    expect(briefing).not.toContain('assessmentResult')
    expect(briefing).not.toContain('gradeRecord')
  })

  it('a low score alone is NOT an item — only a material DECLINE is', () => {
    // A school below the national midpoint every year should not be told so
    // every morning; the step only fires on a drop past the materiality floor.
    //
    // That floor is PER FAMILY. This assertion used to pin the literal `drop < 5`,
    // which quietly froze in a threshold no ACT school can ever cross (five points
    // on a 1-36 scale) and that SAT noise crosses daily (five points on 400-1600).
    expect(briefing).toContain('materialGap(family, SCORE_TYPE_FOR_FAMILY[family])')
    expect(briefing).not.toContain('if (drop < 5) continue')
  })

  it('the briefing goes through gateAggregates, not its own copy of the rule', () => {
    // Round 2 caught five readers that queried the aggregate table directly and
    // walked past the suppression. The fix is only durable if the gate is CALLED,
    // not restated — a re-implementation is a bypass waiting for its next edit.
    const step = briefing.slice(briefing.indexOf('STEP 2.17'))
    expect(step).toContain('gateAggregates(')
    expect(briefing).not.toContain('ACADEMICS_MIN_CELL')
  })

  it('the three assistant tools exist and declare themselves aggregate-only', () => {
    for (const name of ['get_assessment_summary', 'get_lesson_plan_status', 'get_gradebook_summary']) {
      expect(tools).toContain(name)
      expect(service).toContain(`case '${name}'`)
    }
    expect(tools).toContain('AGGREGATES ONLY')
    expect(tools).toContain('COUNTS ONLY')
  })

  it('the assessment tool reads the aggregate table, never the student-level one', () => {
    const handler = service.slice(
      service.indexOf("case 'get_assessment_summary'"),
      service.indexOf("case 'get_lesson_plan_status'"),
    )
    expect(handler).toContain('assessmentSchoolAggregate')
    expect(handler).not.toContain('assessmentResult')
    // No identity column may be selected anywhere in the handler.
    for (const forbidden of ['matchName', 'firstName', 'lastName', 'studentId']) {
      expect(handler).not.toContain(forbidden)
    }
  })

  it('the gradebook + lesson-plan tools select no identity column either', () => {
    const handler = service.slice(
      service.indexOf("case 'get_lesson_plan_status'"),
      service.indexOf("case 'get_roster_summary'"),
    )
    for (const forbidden of ['matchName', 'teacherName', 'firstName', 'lastName']) {
      expect(handler).not.toContain(forbidden)
    }
    // They are groupBy/aggregate reads by construction.
    expect(handler).toContain('groupBy')
  })
})
