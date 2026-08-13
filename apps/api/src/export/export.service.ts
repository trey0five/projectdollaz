// ─────────────────────────────────────────────────────────────────────────────
// DataExportService — "you own your data" as a button, not a clause.
//
// A school asking "can we get our data out if we leave" is really asking
// "without depending on your goodwill, your response time, or your continued
// existence". A support-ticket export answers none of those. This one runs on
// demand, produces a complete archive, and is audited.
//
// SHAPE: the request returns immediately with a job row; the walk happens after.
// A tenant with years of history is tens of thousands of rows across sixty-odd
// tables, which is neither fast enough for a request/response nor slow enough to
// deserve a queue and a worker fleet — so the job row IS the queue, and its
// status is what the UI polls.
// ─────────────────────────────────────────────────────────────────────────────
import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { Prisma, type User } from '@finrep/db'
import { PrismaService } from '../prisma/prisma.service.js'
import { AuditService } from '../common/audit/audit.service.js'
import { DocumentStorageService } from '../knowledge/document-storage.service.js'
import { EXPORTED_TABLES, SKIPPED_TABLES, type ExportTable } from './export.manifest.js'
import { buildZip, toCsv, type ZipEntry } from './zip.js'

/** How long a finished archive stays downloadable. */
const EXPIRY_DAYS = 7

interface DmmfModel {
  name: string
  fields: Array<{ name: string; kind: string }>
}

interface PrismaDelegate {
  findMany(args: { where: Record<string, unknown> }): Promise<Array<Record<string, unknown>>>
}

@Injectable()
export class DataExportService {
  private readonly logger = new Logger(DataExportService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly storage: DocumentStorageService,
  ) {}

  /**
   * Start an export. Returns as soon as the job row exists so the browser is
   * never left holding a request while sixty tables are read.
   */
  async request(actor: User, schoolId: string): Promise<{ id: string; status: string }> {
    const school = await this.prisma.school.findUnique({
      where: { id: schoolId },
      select: { id: true, name: true },
    })
    if (!school) throw new NotFoundException('School not found.')

    const job = await this.prisma.dataExport.create({
      data: { schoolId, requestedByUserId: actor.id, status: 'running', scope: 'school' },
      select: { id: true, status: true },
    })

    await this.audit.write({
      schoolId,
      userId: actor.id,
      action: 'export.requested',
      targetType: 'dataExport',
      targetId: job.id,
      // The request is audited BEFORE the work: an export is a complete copy of
      // a school's records leaving the platform, and that fact should survive
      // the job failing halfway.
      metadata: { scope: 'school' },
    })

    // Deliberately not awaited — the caller gets the job id now.
    void this.run(job.id, schoolId, school.name).catch((err: unknown) => {
      this.logger.error(`export ${job.id} failed: ${String(err)}`)
    })

    return job
  }

  /** Recent exports for a school, newest first. */
  async list(schoolId: string) {
    return this.prisma.dataExport.findMany({
      where: { schoolId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        status: true,
        scope: true,
        byteSize: true,
        rowCounts: true,
        error: true,
        expiresAt: true,
        createdAt: true,
        completedAt: true,
      },
    })
  }

  /**
   * A short-lived download link. The archive lives in the same bucket as the
   * document store, and the URL carries a signature rather than a key.
   */
  async downloadUrl(actor: User, schoolId: string, id: string): Promise<{ url: string }> {
    const job = await this.prisma.dataExport.findFirst({
      where: { id, schoolId },
      select: { status: true, fileKey: true, expiresAt: true },
    })
    if (!job) throw new NotFoundException('Export not found.')
    if (job.status !== 'ready' || !job.fileKey) {
      throw new ForbiddenException('That export is not ready to download.')
    }
    if (job.expiresAt && job.expiresAt.getTime() < Date.now()) {
      throw new ForbiddenException('That export has expired. Request a new one — it takes a moment.')
    }

    // Downloads are audited too. "Who took a copy of the school's records, and
    // when" is exactly the question an incident review asks.
    await this.audit.write({
      schoolId,
      userId: actor.id,
      action: 'export.downloaded',
      targetType: 'dataExport',
      targetId: id,
      metadata: {},
    })
    return { url: await this.storage.presignGetUrl(job.fileKey) }
  }

  // ── the walk ──────────────────────────────────────────────────────────────

  private async run(jobId: string, schoolId: string, schoolName: string): Promise<void> {
    const entries: ZipEntry[] = []
    const rowCounts: Record<string, number> = {}

    try {
      for (const table of EXPORTED_TABLES) {
        const rows = await this.readTable(table, schoolId)
        rowCounts[`${table.folder}/${table.file}`] = rows.length
        // An EMPTY table still gets a file. A missing file reads as "we lost
        // it"; a header row with nothing under it reads as "you never had any",
        // which is the true and much less alarming statement.
        entries.push({
          name: `${table.folder}/${table.file}.csv`,
          data: Buffer.from(toCsv(rows, this.columnsFor(table)), 'utf8'),
        })
      }

      entries.push({
        name: 'README.txt',
        data: Buffer.from(this.readme(schoolName, rowCounts), 'utf8'),
      })

      const zip = buildZip(entries)
      const key = `exports/${schoolId}/${jobId}.zip`
      await this.storage.putObject(zip, key, 'application/zip')

      await this.prisma.dataExport.update({
        where: { id: jobId },
        data: {
          status: 'ready',
          fileKey: key,
          byteSize: zip.length,
          rowCounts,
          completedAt: new Date(),
          expiresAt: new Date(Date.now() + EXPIRY_DAYS * 24 * 60 * 60 * 1000),
        },
      })
    } catch (err) {
      // The message is shown to the person who asked, so it says what happened
      // rather than "an error occurred".
      await this.prisma.dataExport.update({
        where: { id: jobId },
        data: { status: 'failed', error: String((err as Error)?.message ?? err).slice(0, 500) },
      })
      throw err
    }
  }

  /**
   * The column list for a table, from the schema rather than from the rows.
   *
   * Deriving columns from the data means an EMPTY table produces a file with no
   * header — a zero-byte CSV, which is precisely the "did we lose this?" signal
   * the README promises it is not. Reading the model's own fields gives every
   * file a header whether or not the school ever had a row, so an empty file
   * says "you had none of these" instead of saying nothing at all.
   */
  private columnsFor(table: ExportTable): string[] | undefined {
    const models = (Prisma as unknown as { dmmf?: { datamodel: { models: DmmfModel[] } } }).dmmf?.datamodel?.models
    if (!models) return undefined
    const wanted = table.model.toLowerCase()
    const model = models.find((m) => m.name.toLowerCase() === wanted)
    if (!model) return undefined
    const omit = new Set(table.omit ?? [])
    return model.fields
      .filter((f) => f.kind === 'scalar' || f.kind === 'enum')
      .map((f) => f.name)
      .filter((n) => !omit.has(n))
  }

  /** One table, tenant-scoped, with credential columns stripped. */
  private async readTable(table: ExportTable, schoolId: string): Promise<Array<Record<string, unknown>>> {
    const delegate = (this.prisma as unknown as Record<string, PrismaDelegate>)[table.model]
    if (!delegate?.findMany) {
      // Cannot happen while export.manifest.spec.ts passes — it checks every
      // name against the schema — but a silently absent table is precisely the
      // failure this feature must not have.
      throw new Error(`export manifest names "${table.model}", which is not a Prisma model`)
    }
    const rows = await delegate.findMany({ where: { schoolId } })
    if (!table.omit?.length) return rows
    const omit = new Set(table.omit)
    return rows.map((row) => Object.fromEntries(Object.entries(row).filter(([k]) => !omit.has(k))))
  }

  /**
   * The archive explains itself. Somebody opens this in two years, at a school
   * that no longer uses KYRO, with no one around who remembers what it is.
   */
  private readme(schoolName: string, rowCounts: Record<string, number>): string {
    const total = Object.values(rowCounts).reduce((a, b) => a + b, 0)
    const lines = [
      `DATA EXPORT — ${schoolName}`,
      '',
      'This archive is a complete copy of your school\'s records held in KYRO.',
      'It belongs to your school. You may keep it, move it, or load it elsewhere;',
      'no part of it requires KYRO to read.',
      '',
      'FORMAT',
      '  Every file is CSV (UTF-8, with a byte-order mark so Excel opens accented',
      '  names correctly). Folders group the data the way a school thinks about it',
      '  rather than the way our database stores it. A file with only a header row',
      '  means you had no records of that kind — not that any were lost.',
      '',
      `CONTENTS — ${Object.keys(rowCounts).length} files, ${total.toLocaleString()} rows`,
      '',
    ]
    const byFolder = new Map<string, string[]>()
    for (const [path, count] of Object.entries(rowCounts)) {
      const [folder, file] = path.split('/')
      const list = byFolder.get(folder) ?? []
      const label = `${count.toLocaleString()} row${count === 1 ? '' : 's'}`
      list.push(`    ${file}.csv${' '.repeat(Math.max(1, 34 - file.length))}${label}`)
      byFolder.set(folder, list)
    }
    for (const [folder, files] of byFolder) {
      lines.push(`  ${folder}/`, ...files, '')
    }

    lines.push(
      'NOT INCLUDED, AND WHY',
      '',
      ...SKIPPED_TABLES.flatMap((t) => [`  ${t.folder}/${t.file}`, `    ${t.skip}`, '']),
      'Connection credentials (tokens for QuickBooks, your SIS, and pending',
      'invitations) are stripped from the files above. They are keys to other',
      'systems rather than information about your school, and an archive that',
      'travels by email is the wrong place for them.',
      '',
      'DOCUMENTS',
      '  documents/document-index.csv lists every file you uploaded, with its name,',
      '  type and date. The files themselves are downloaded from the Documents page.',
      '',
      'QUESTIONS',
      '  support@ourkyro.com',
    )
    return lines.join('\n')
  }
}
