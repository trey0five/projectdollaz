import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { AssessmentsService } from './assessments.service.js'

const here = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(here, 'assessments.service.ts'), 'utf-8')

/**
 * A PICKER'S OPTIONS MUST NOT DEPEND ON THE PICKER'S OWN VALUE.
 *
 * `availableTestTypes` used to be derived from the dashboard's rows — and those
 * rows are already filtered to the selected test type. So selecting ACT rewrote
 * the menu to ['act'], TerraNova vanished from the only control that could
 * change it back, and the user was stranded on the ACT view with no route out
 * short of clearing local storage.
 *
 * The class of bug is worth a guard rather than a one-line fix: any list that
 * populates a filter control has to be computed BEFORE that filter is applied.
 */
describe('academics dashboard — the test-type picker cannot trap the user', () => {
  const svc = (rows: Array<{ testType: string }>) => {
    const seen: Array<Record<string, unknown>> = []
    const prisma = {
      assessmentSchoolAggregate: {
        findMany: (args: Record<string, unknown>) => {
          seen.push(args)
          return Promise.resolve(rows)
        },
      },
    }
    // Only the one collaborator this method touches; the rest of the service is
    // exercised by the e2e path.
    const instance = Object.create(AssessmentsService.prototype) as AssessmentsService
    ;(instance as unknown as { prisma: unknown }).prisma = prisma
    return { instance, seen }
  }

  const call = (instance: AssessmentsService, ids: string[]) =>
    (instance as unknown as { testTypesFor: (i: string[]) => Promise<string[]> }).testTypesFor(ids)

  it('lists every test type the schools have results for', async () => {
    const { instance } = svc([{ testType: 'terranova' }, { testType: 'act' }])
    expect(await call(instance, ['s1', 's2'])).toEqual(['act', 'terranova'])
  })

  it('never narrows the query by test type — that is what caused the trap', async () => {
    const { instance, seen } = svc([{ testType: 'act' }])
    await call(instance, ['s1'])
    expect(seen).toHaveLength(1)
    const where = seen[0].where as Record<string, unknown>
    expect(
      'testType' in where,
      'testTypesFor must read every type on file. Filtering it by the selected ' +
        'type is exactly the bug that removed TerraNova from the menu.',
    ).toBe(false)
    expect(seen[0].distinct).toEqual(['testType'])
  })

  it('asks for nothing when there are no schools in scope', async () => {
    const { instance, seen } = svc([{ testType: 'act' }])
    expect(await call(instance, [])).toEqual([])
    expect(seen).toHaveLength(0)
  })

  it('both dashboards populate the picker from that lookup, not from the filtered rows', () => {
    // The regression re-enters the moment someone writes the convenient thing:
    //   availableTestTypes: [...new Set(all.map((a) => a.testType))]
    // where `all` was fetched with { testType: q.testType }.
    expect(
      /availableTestTypes:\s*\[\.\.\.new Set\(all\.map/.test(source),
      'A dashboard is deriving the picker options from the test-type-FILTERED rows again.',
    ).toBe(false)

    const uses = source.match(/^\s*availableTestTypes,\s*$/gm) ?? []
    expect(uses.length, 'both the school and org dashboards should echo the unfiltered list').toBe(2)

    const lookups = source.match(/await this\.testTypesFor\(/g) ?? []
    expect(lookups.length).toBe(2)
  })
})
