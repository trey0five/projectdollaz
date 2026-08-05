// ─────────────────────────────────────────────────────────────────────────────
// THE GAP: a connected SIS produced a headcount and NEVER a student record.
//
// Reported as "I added a roster but the student roster is still blank". Two
// separate causes turned out to share that symptom; this file guards the second
// one, which was not stale data but a permanent structural hole:
//
//   EnrollmentService.sync() → adapter.fetch() → NormalizedEnrollmentSnapshot.
//
// Every adapter was ALREADY fetching people — Blackbaud's /school/v1/users
// returns first_name and last_name on the very row the grade came from — and
// buildNormalizedSnapshot discarded them one line later. So a school that
// connected its SIS instead of uploading a file got "436 enrolled" on the
// Enrollment page and an empty register forever: no records to edit, and
// Waitlist / Support flags / New this year dashed permanently.
//
// These read source rather than booting Nest: apps/api has no @nestjs/testing,
// and the thing being defended is the SHAPE of the data path — that rows reach
// the register at all, and that names stop before the response. A render test
// heavy enough to need a live Blackbaud tenant is a test that gets skipped.
// ─────────────────────────────────────────────────────────────────────────────
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const HERE = fileURLToPath(new URL('.', import.meta.url))
const read = (rel: string): string => readFileSync(HERE + rel, 'utf8')

const adapter = read('adapters/adapter.ts')
const normalize = read('enrollment.normalize.ts')
const service = read('enrollment.service.ts')
const rosterUpload = read('roster-upload.service.ts')
const controller = read('enrollment.controller.ts')
const client = read('enrollment.client.ts')

describe('an adapter hands back the people it counted, not just the count', () => {
  it('fetch() returns snapshot AND rows', () => {
    expect(adapter).toMatch(/export interface AdapterRoster/)
    expect(adapter).toMatch(/snapshot: NormalizedEnrollmentSnapshot/)
    expect(adapter).toMatch(/rows: readonly RawStudentRow\[\]/)
    expect(adapter).toMatch(/fetch\(source: EnrollmentSource, asOf\?: string\): Promise<AdapterRoster>/)
  })

  it('every adapter pairs them through ONE helper, so they cannot drift', () => {
    expect(adapter).toMatch(/export function snapshotAndRows/)
    for (const f of [
      'adapters/blackbaud.adapter.ts',
      'adapters/facts.adapter.ts',
      'adapters/veracross.adapter.ts',
      'adapters/oneroster-api.adapter.ts',
    ]) {
      const src = read(f)
      expect(src, f).toMatch(/return snapshotAndRows\(/)
      // The old direct call built a snapshot with no rows beside it.
      expect(src, f).not.toMatch(/return buildNormalizedSnapshot\(/)
    }
  })

  it('RawStudentRow carries identity, and every identity field is OPTIONAL', () => {
    // Optional matters: a provider that returns no names must keep syncing its
    // headcount exactly as before rather than failing to compile or to run.
    for (const field of ['externalId', 'firstName', 'lastName', 'birthDate']) {
      expect(normalize, field).toMatch(new RegExp(`${field}\\?: string \\| null`))
    }
  })

  it('Blackbaud reads the names off the row it was already fetching', () => {
    expect(client).toMatch(/first_name\?: string/)
    expect(client).toMatch(/last_name\?: string/)
    expect(client).toMatch(/firstName: u\.first_name/)
    expect(client).toMatch(/lastName: u\.last_name/)
  })

  it('Blackbaud uses the LEGAL name, not the preferred one, as the match key', () => {
    // A preferred name can change without the person changing, which would
    // re-create the same pupil as a new record on the next sync.
    expect(client).not.toMatch(/firstName: u\.preferred_name/)
  })
})

describe('sync creates records through the one service allowed to', () => {
  it('EnrollmentService no longer owns the route — it cannot import StudentsService', () => {
    // StudentsService imports EnrollmentService, so the cycle forbids the reverse.
    // That is why RosterUploadService exists, and why sync had to move to it.
    expect(service).toMatch(/async syncAndIntake\(/)
    // Anchored to a real import STATEMENT: the un-anchored version matched this
    // service's own comment explaining why it may not import StudentsService.
    expect(service).not.toMatch(/^import .*StudentsService/m)
    expect(rosterUpload).toMatch(/async sync\(/)
    expect(rosterUpload).toMatch(/this\.enrollment\.syncAndIntake\(/)
    expect(rosterUpload).toMatch(/this\.students\.importCommit\(/)
  })

  it('the controller routes sync through RosterUploadService', () => {
    expect(controller).toMatch(/return this\.rosterUpload\.sync\(user, schoolId, dto\.asOf\)/)
    expect(controller).not.toMatch(/return this\.enrollment\.sync\(/)
  })

  it('a sync MERGES and never replaces', () => {
    // `replace` deletes every student in the register. A sync can fire from a
    // schedule or a reconnect; a hand-entered pupil the SIS does not know about
    // must not vanish because one ran.
    const body = rosterUpload.slice(rosterUpload.indexOf('async sync('), rosterUpload.indexOf('async upload('))
    // Through the chunker now, mode still hard-coded 'merge' — a sync can fire
    // from a schedule, and replace deletes hand-entered pupils the SIS never knew.
    expect(body).toMatch(/commitInChunks\(actor, schoolId, 'merge'/)
    expect(body).not.toMatch(/'replace'/)
  })

  it('a sync does NOT supersede a hand-entered figure', () => {
    // The upload path supersedes because an upload is a deliberate dated act by a
    // person. A scheduled sync is not, and that distinction is the whole decision.
    const body = rosterUpload.slice(rosterUpload.indexOf('async sync('), rosterUpload.indexOf('async upload('))
    expect(body).toMatch(/supersedeManual: false/)
  })

  it('withdrawn is decided by ONE exported predicate, not re-derived', () => {
    // Re-deriving it at the second call site is how a register ends up
    // disagreeing with its own headcount.
    expect(normalize).toMatch(/export function isWithdrawnStatus/)
    expect(rosterUpload).toMatch(/isWithdrawnStatus\(r\.status\)/)
  })

  it('sync writes are CHUNKED; only the runaway backstop degrades to counts-only', () => {
    const body = rosterUpload.slice(rosterUpload.indexOf('async sync('), rosterUpload.indexOf('async upload('))
    expect(body).toMatch(/ROSTER_UPLOAD_HARD_CAP/)
    expect(body).toMatch(/commitInChunks\(actor, schoolId, 'merge'/)
    expect(body).toMatch(/headcount was synced but the student records were not/)
  })
})

describe('FERPA: provider names stop at the service', () => {
  it('the sync RESULT type carries counts only', () => {
    const block = rosterUpload.slice(
      rosterUpload.indexOf('export interface SyncResult'),
      rosterUpload.indexOf('export interface RosterUploadResult'),
    )
    expect(block).toMatch(/created: number/)
    for (const banned of ['firstName', 'lastName', 'birthDate', 'name:']) {
      expect(block, banned).not.toMatch(new RegExp(banned))
    }
  })

  it('skip counters are aggregate — a provider row never names anyone', () => {
    const body = rosterUpload.slice(rosterUpload.indexOf('async sync('), rosterUpload.indexOf('async upload('))
    // The warnings are built from counters, never from a row's fields.
    expect(body).toMatch(/\$\{missingName\} row\(s\) skipped/)
    expect(body).toMatch(/\$\{unmappedGrade\} row\(s\) skipped/)
    expect(body).not.toMatch(/\$\{[a-z]*[Ff]irstName\}/)
    expect(body).not.toMatch(/\$\{[a-z]*[Ll]astName\}/)
  })
})
