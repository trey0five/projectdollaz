import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { EXPORT_TABLES, EXPORTED_TABLES, SKIPPED_TABLES } from './export.manifest.js'

const here = dirname(fileURLToPath(import.meta.url))
const schema = readFileSync(join(here, '../../../../packages/db/prisma/schema.prisma'), 'utf-8')

/**
 * THE COMPLETENESS GUARANTEE.
 *
 * "You own your data and you can take it whenever you like" is a promise the
 * PRODUCT has to keep, not the terms of service. The failure mode that would
 * break it is quiet: someone adds a table in six months, never touches this
 * file, and every export from that day forward is missing it — while still
 * being called "everything". A school then deletes its account on the strength
 * of a download that had a hole in it.
 *
 * So the manifest is checked against the schema itself. A new tenant-scoped
 * model fails this spec until somebody decides, in writing, whether it is the
 * school's data or ours.
 */
describe('export manifest — every tenant table is accounted for', () => {
  const models = [...schema.matchAll(/model (\w+) \{([\s\S]*?)\n\}/g)]
  const tenantModels = models
    .filter(([, , body]) => /^\s+schoolId\s/m.test(body))
    .map(([, name]) => name)
  const decl = (name: string) => `${name.charAt(0).toLowerCase()}${name.slice(1)}`

  it('found the schema', () => {
    expect(tenantModels.length).toBeGreaterThan(50)
  })

  it('every model with a schoolId is either exported or explicitly skipped', () => {
    const accounted = new Set(EXPORT_TABLES.map((t) => t.model))
    const missing = tenantModels.map(decl).filter((m) => !accounted.has(m))
    expect(
      missing,
      `These tenant-scoped models are in the schema but not in the export manifest. ` +
        `Add them to EXPORT_TABLES — or give them a \`skip\` with a reason the school will read.`,
    ).toEqual([])
  })

  it('names no model that does not exist', () => {
    const known = new Set(tenantModels.map(decl))
    for (const t of EXPORT_TABLES) {
      expect(known.has(t.model), `manifest names "${t.model}", which is not a tenant-scoped model`).toBe(true)
    }
  })

  it('every skip carries a reason a school can read, not a shrug', () => {
    for (const t of SKIPPED_TABLES) {
      expect(t.skip!.length, `"${t.model}" is skipped without a real explanation`).toBeGreaterThan(40)
    }
  })

  it('writes no credential into an archive a school will email around', () => {
    // The two tables holding keys to other people's systems must strip them.
    const secretish = /token|secret|password|apikey|api_key|credential/i
    for (const t of EXPORTED_TABLES) {
      const body = models.find(([, name]) => decl(name) === t.model)?.[2] ?? ''
      const fields = body
        .split('\n')
        .map((l) => l.trim().split(/\s+/)[0])
        .filter((f) => f && !f.startsWith('@') && !f.startsWith('//'))
      const leaked = fields.filter((f) => secretish.test(f) && !(t.omit ?? []).includes(f))
      expect(
        leaked,
        `"${t.model}" would export ${leaked.join(', ')} — add to \`omit\`. These are keys to systems, not school data.`,
      ).toEqual([])
    }
  })

  it('gives every exported table a unique path in the archive', () => {
    const paths = EXPORTED_TABLES.map((t) => `${t.folder}/${t.file}`)
    expect(paths.length).toBe(new Set(paths).size)
  })

  it('groups files the way a school thinks, not the way the schema does', () => {
    const folders = new Set(EXPORTED_TABLES.map((t) => t.folder))
    for (const expected of ['finance', 'enrollment', 'academics', 'governance', 'documents']) {
      expect(folders.has(expected)).toBe(true)
    }
  })
})
