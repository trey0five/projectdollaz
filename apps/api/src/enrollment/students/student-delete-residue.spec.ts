import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const service = readFileSync(join(here, 'students.service.ts'), 'utf-8')
const schema = readFileSync(join(here, '../../../../../packages/db/prisma/schema.prisma'), 'utf-8')

/**
 * DELETING A STUDENT HAS TO REACH THE NAME.
 *
 * students.service.ts documents its delete as a hard one with "no soft-delete
 * PII shadow", and the SCHEMA quietly contradicted it: AssessmentResult.student
 * and GradeRecord.student are both `onDelete: SetNull`, so removing a student
 * nulled the foreign key and left `matchName` — their name, exactly as it
 * appeared in the import file — sitting on every score and mark they ever had.
 * The child was gone from the roster and still named on their own results.
 *
 * The relation cannot be Cascade instead: the scores are the school's aggregate
 * history and are already counted in published averages, so deleting them would
 * silently restate years of reporting. The identity goes; the numbers stay.
 *
 * That makes this a rule the SERVICE has to keep, which is what this spec pins —
 * on all three paths, because a school can lose a student one at a time, by
 * clearing the register, or by re-uploading a roster in replace mode.
 */
describe('deleting a student leaves no name behind', () => {
  it('the relation really is SetNull — the premise of this spec', () => {
    // If someone changes these to Cascade the scrub becomes redundant rather
    // than wrong, but the reasoning above should be revisited deliberately.
    const results = /model AssessmentResult \{[\s\S]*?\n\}/.exec(schema)?.[0] ?? ''
    const grades = /model GradeRecord \{[\s\S]*?\n\}/.exec(schema)?.[0] ?? ''
    expect(results).toContain('onDelete: SetNull')
    expect(grades).toContain('onDelete: SetNull')
  })

  it('the identity columns that would survive are the ones we scrub', () => {
    // matchName is the name from the file; matchExternalId is the school's own
    // student id. Both identify a child without the foreign key.
    for (const col of ['matchName', 'matchExternalId']) {
      expect(schema).toContain(col)
    }
  })

  const scrubs = (block: string) =>
    /assessmentResult\.updateMany/.test(block) &&
    /gradeRecord\.updateMany/.test(block) &&
    /matchName: null/.test(block) &&
    /matchExternalId: null/.test(block)

  it('remove() scrubs before it deletes', () => {
    const block = service.slice(service.indexOf('async remove('), service.indexOf('CLEAR THE WHOLE REGISTER'))
    expect(scrubs(block), 'remove() deletes the student without clearing their name off their scores').toBe(true)
    // In one transaction — a scrub that commits without the delete, or a delete
    // that commits without the scrub, are both worse than either alone.
    expect(block).toContain('$transaction')
  })

  it('clearing the whole register scrubs too', () => {
    const start = service.indexOf('enrollment.roster.cleared')
    const block = service.slice(Math.max(0, start - 2000), start)
    expect(scrubs(block), 'clearRegister leaves every name on every score').toBe(true)
  })

  it('a replace-mode roster import scrubs ONLY the students who are actually leaving', () => {
    const start = service.indexOf("if (mode === 'replace')")
    const block = service.slice(start, start + 3200)
    expect(scrubs(block), 'replace mode leaves the old names on the old scores').toBe(true)

    // AND NOT THE ONES COMING BACK. Replace rebuilds the register from the file,
    // so most of these students return immediately — scrubbing every matched row
    // stripped the name off scores belonging to children who never left, and
    // matchName is exactly what a later re-match needs, so their history was
    // orphaned by a routine re-upload.
    expect(block).toContain('departing')
    expect(block, 'the scrub is still school-wide').not.toMatch(/studentId: \{ not: null \}/)
  })

  it('the scores themselves are NOT deleted — the history survives the child leaving', () => {
    // The scrub must be an update, never a delete: these rows are counted in
    // published school averages and removing them would restate them.
    const block = service.slice(service.indexOf('async remove('), service.indexOf('CLEAR THE WHOLE REGISTER'))
    expect(block).not.toMatch(/assessmentResult\.deleteMany/)
    expect(block).not.toMatch(/gradeRecord\.deleteMany/)
  })
})
