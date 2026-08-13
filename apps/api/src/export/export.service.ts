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
import { NotificationsService } from '../common/notifications/notifications.service.js'
import { EXPORTED_TABLES, SKIPPED_TABLES, type ExportTable } from './export.manifest.js'
import { buildZip, toCsv, type ZipEntry } from './zip.js'

/** How long a finished archive stays downloadable. */
const EXPIRY_DAYS = 7

/**
 * The whole archive is built in memory, so there has to be a ceiling — an
 * unbounded walk of a large tenant would take the API process down for every
 * school on it, which is a far worse outcome than one school being told to ask.
 * Well above any real tenant: the live three-school diocese archive is 334 KB.
 */
const MAX_ARCHIVE_BYTES = 512 * 1024 * 1024

/**
 * A job older than this that is still 'running' was orphaned — the API restarted
 * mid-walk, so nothing will ever finish it. Without this the UI polls a row that
 * can never change and the school is told "preparing…" forever.
 */
const STALE_JOB_MINUTES = 30

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
    private readonly notifications: NotificationsService,
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

    await this.refuseIfBusy({ schoolId })
    const job = await this.prisma.dataExport.create({
      data: { schoolId, requestedByUserId: actor.id, status: 'running', scope: 'school', schoolIds: [schoolId] },
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

    // AN EXPORT IS NEVER SILENT.
    //
    // The role floor is right — owner, which is ~1.1 people per school — but a
    // role decides WHO MAY, not whether anyone finds out. This is the widest
    // read in the product and it leaves the platform: once the zip is
    // downloaded no control of ours applies to it. So every other owner is told,
    // by name, that a complete copy was taken and by whom. That is the control
    // that actually matters here, and unlike a step-up MFA prompt it works for
    // every school rather than the few with TOTP switched on.
    // Told AFTER the job row exists but only once we know the archive can
    // actually be produced — announcing "a complete copy left the platform" and
    // then failing on unconfigured storage is an alarming lie.
    if (this.storage.isConfigured()) await this.tellTheOtherOwners(schoolId, actor, job.id)

    // Deliberately not awaited — the caller gets the job id now.
    void this.run(job.id, schoolId, school.name).catch((err: unknown) => {
      this.logger.error(`export ${job.id} failed: ${String(err)}`)
    })

    return job
  }

  /**
   * Tell every OTHER owner. Best-effort by construction: a notification that
   * fails must never be the reason a school cannot get its own data out.
   */
  private async tellTheOtherOwners(
    schoolId: string,
    actor: User,
    jobId: string,
    orgSchools?: number,
  ): Promise<void> {
    try {
      const owners = await this.prisma.membership.findMany({
        where: { schoolId, role: 'owner', userId: { not: actor.id } },
        select: { userId: true },
      })
      const who = [actor.firstName, actor.lastName].filter(Boolean).join(' ').trim() || actor.email
      await Promise.all(
        owners.map((m) =>
          this.notifications.notify({
            userId: m.userId,
            actorUserId: actor.id,
            subject: orgSchools
              ? 'A network-wide data export included your school'
              : 'A full data export was requested',
            body: orgSchools
              ? `${who} requested a complete export covering ${orgSchools} schools in your organization, ` +
                `including yours — every module, with the student roster and the audit log. You are being told ` +
                `because it is a complete copy of your school's records leaving the platform. ` +
                `If you did not expect it, speak to them.`
              : `${who} requested a complete export of your school's records in KYRO — every module, ` +
                `including the student roster and the audit log. This is a normal thing for an owner to do, ` +
                `and you are being told because it is a complete copy leaving the platform. ` +
                `If you did not expect it, speak to them.`,
            link: '/settings/data',
            senderLabel: 'KYRO',
          }),
        ),
      )
    } catch (err) {
      this.logger.warn(`export ${jobId}: could not notify co-owners — ${String(err)}`)
    }
  }

  /**
   * The diocesan export: every school in the organization, in one archive.
   *
   * Scoped by what the CALLER may actually see, not by what the org contains —
   * a superintendent who owns three schools of twenty gets three. The archive is
   * foldered by school so it is navigable rather than one flat pile, and each
   * school's owners are told, because a network-wide pull is a bigger act than a
   * principal taking their own school's records.
   */
  async requestOrg(actor: User, organizationId: string): Promise<{ id: string; status: string; schools: number }> {
    const schools = await this.writableSchools(actor, organizationId)
    if (schools.length === 0) {
      throw new ForbiddenException('You do not own any school in this organization.')
    }

    await this.refuseIfBusy({ organizationId })
    const job = await this.prisma.dataExport.create({
      data: {
        organizationId,
        requestedByUserId: actor.id,
        status: 'running',
        scope: 'organization',
        // WHAT IS ACTUALLY IN IT. Without this the download could only ask
        // "does the caller own anything in this org", which is not the question.
        schoolIds: schools.map((sc) => sc.id),
      },
      select: { id: true, status: true },
    })

    await Promise.all(
      schools.map((sc) =>
        this.audit.write({
          organizationId,
          schoolId: sc.id,
          userId: actor.id,
          action: 'export.requested',
          targetType: 'dataExport',
          targetId: job.id,
          metadata: { scope: 'organization', schools: schools.length },
        }),
      ),
    )
    if (this.storage.isConfigured()) {
      for (const sc of schools) await this.tellTheOtherOwners(sc.id, actor, job.id, schools.length)
    }

    void this.runOrg(job.id, organizationId, schools).catch((err: unknown) => {
      this.logger.error(`org export ${job.id} failed: ${String(err)}`)
    })

    return { ...job, schools: schools.length }
  }

  /**
   * One at a time. Each job materialises every row of ~66 tables plus the CSVs
   * plus the whole ZIP in memory, so a double-click — never mind a loop — is a
   * straightforward way to take the API down for every school on it. Refusing is
   * also the honest answer: the archive already running is the one they want.
   */
  private async refuseIfBusy(where: { schoolId?: string; organizationId?: string }): Promise<void> {
    await this.reapStale(where)
    const running = await this.prisma.dataExport.findFirst({
      where: { ...where, status: 'running' },
      select: { id: true },
    })
    if (running) {
      throw new ForbiddenException('An export is already being prepared. It will appear here when it is ready.')
    }
  }

  /** Schools in the org this caller OWNS — the same floor the school route uses. */
  private async writableSchools(actor: User, organizationId: string): Promise<Array<{ id: string; name: string }>> {
    const memberships = await this.prisma.membership.findMany({
      // status: 'active' matters — RolesGuard applies it on the school routes, so
      // without it the org floor is strictly WEAKER than the school floor it
      // claims to match, and a revoked membership still opens the whole network.
      where: { userId: actor.id, role: 'owner', status: 'active', school: { organizationId } },
      select: { school: { select: { id: true, name: true } } },
    })
    return memberships.map((m) => m.school).filter((sc): sc is { id: string; name: string } => !!sc)
  }

  /**
   * Recent exports for an organization.
   *
   * TAKES THE ACTOR AND CHECKS THEM. This shipped without the check while the
   * download route beside it had one, which meant any authenticated user could
   * list any org's exports by id — and `rowCounts` is keyed by school folder
   * slug, so the response spelled out every school's NAME and how many rows of
   * each kind it holds. Metadata about a tenant is still that tenant's.
   */
  async listOrg(actor: User, organizationId: string) {
    const mine = (await this.writableSchools(actor, organizationId)).map((sc) => sc.id)
    if (mine.length === 0) {
      throw new ForbiddenException('You do not own any school in this organization.')
    }
    await this.reapStale({ organizationId })
    // ONLY ARCHIVES THIS CALLER COULD DOWNLOAD. rowCounts is keyed by school
    // folder slug, so listing every org job told one owner the NAME of every
    // other school and how many rows of each kind it holds.
    const rows = await this.prisma.dataExport.findMany({
      where: { organizationId },
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
        schoolIds: true,
      },
    })
    const owned = new Set(mine)
    return rows.filter((r) => r.schoolIds.length > 0 && r.schoolIds.every((sid) => owned.has(sid)))
  }

  /** Download an org archive — the caller must own every school inside it. */
  async orgDownloadUrl(actor: User, organizationId: string, id: string): Promise<{ url: string }> {
    const job = await this.prisma.dataExport.findFirst({
      where: { id, organizationId },
      select: { status: true, fileKey: true, expiresAt: true, schoolIds: true },
    })
    if (!job) throw new NotFoundException('Export not found.')

    // THE ARCHIVE'S CONTENTS DECIDE, NOT THE ORG.
    //
    // "Owns at least one school here" was the wrong question. An org archive is
    // built from the REQUESTER's schools, so a principal who owns one school of
    // twenty could download the superintendent's twenty-school archive — every
    // roster, every gift, every audit log, of nineteen schools they have no
    // membership in. The caller must own EVERY school inside it.
    const mine = new Set((await this.writableSchools(actor, organizationId)).map((sc) => sc.id))
    const notMine = job.schoolIds.filter((sid) => !mine.has(sid))
    if (job.schoolIds.length === 0 || notMine.length > 0) {
      throw new ForbiddenException(
        'That export covers schools you do not own. Request your own — it will contain the schools you do.',
      )
    }
    if (job.status !== 'ready' || !job.fileKey) throw new ForbiddenException('That export is not ready to download.')
    if (job.expiresAt && job.expiresAt.getTime() < Date.now()) {
      throw new ForbiddenException('That export has expired. Request a new one — it takes a moment.')
    }
    await this.audit.write({
      organizationId,
      userId: actor.id,
      action: 'export.downloaded',
      targetType: 'dataExport',
      targetId: id,
      metadata: { scope: 'organization' },
    })
    return { url: await this.storage.presignGetUrl(job.fileKey) }
  }

  private async runOrg(
    jobId: string,
    organizationId: string,
    schools: Array<{ id: string; name: string }>,
  ): Promise<void> {
    const entries: ZipEntry[] = []
    const rowCounts: Record<string, number> = {}
    try {
      // Folder per school, named readably. A twenty-school diocese opening one
      // flat directory of six hundred CSVs has been handed a puzzle, not data.
      //
      // BUT THE NAME IS NOT UNIQUE. Two "St. Mary School" in one diocese — or
      // "St. Mary (North)" and "St. Mary — North", which slug identically —
      // produced the same folder, so one school's CSVs overwrote the other's on
      // extraction and its rowCounts keys clobbered them on the row. The archive
      // was silently missing a whole school while calling itself complete.
      // Disambiguate only when we must, so the common case stays readable.
      const slugs = new Map<string, string>()
      const seen = new Map<string, number>()
      for (const sc of schools) {
        const base = sc.name.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'school'
        const n = (seen.get(base) ?? 0) + 1
        seen.set(base, n)
        slugs.set(sc.id, n === 1 ? base : `${base}-${sc.id.slice(0, 8)}`)
      }
      // A first occurrence keeps the bare name only if nothing else claims it.
      const collided = new Set([...seen.entries()].filter(([, n]) => n > 1).map(([b]) => b))
      for (const sc of schools) {
        const base = sc.name.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'school'
        if (collided.has(base)) slugs.set(sc.id, `${base}-${sc.id.slice(0, 8)}`)
      }

      for (const sc of schools) {
        const slug = slugs.get(sc.id) as string
        for (const table of EXPORTED_TABLES) {
          const rows = await this.readTable(table, sc.id)
          rowCounts[`${slug}/${table.folder}/${table.file}`] = rows.length
          entries.push({
            name: `${slug}/${table.folder}/${table.file}.csv`,
            data: Buffer.from(toCsv(rows, this.columnsFor(table)), 'utf8'),
          })
        }
      }
      for (const sc of schools) {
        const slug = slugs.get(sc.id) as string
        const people = await this.peopleFor([sc.id])
        rowCounts[`${slug}/account/people`] = people.length
        entries.push({
          name: `${slug}/account/people.csv`,
          data: Buffer.from(toCsv(people, ['userId', 'email', 'firstName', 'lastName', 'role', 'title']), 'utf8'),
        })
      }

      entries.push({
        name: 'README.txt',
        data: Buffer.from(this.readme(`${schools.length} schools`, rowCounts), 'utf8'),
      })

      const zip = this.sealed(entries)
      // Filed under the FIRST school in the archive, for the same reason: an org
      // archive has no prefix of its own, and an orphan is worse than an
      // arbitrary-but-purged home. Deleting that school removes it; the school
      // list on the row is what authorises the download either way.
      const key = `${this.storage.schoolPrefix(schools[0].id)}exports/org-${jobId}.zip`
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
      await this.prisma.dataExport.update({
        where: { id: jobId },
        data: { status: 'failed', error: String((err as Error)?.message ?? err).slice(0, 500) },
      })
      throw err
    }
  }

  /** Recent exports for a school, newest first. */
  async list(schoolId: string) {
    await this.reapStale({ schoolId })
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

      // Who the ids in the audit log and the member list actually are. Scoped to
      // people with a membership at THIS school — a User is global, and the
      // school is not entitled to the rest of them.
      const people = await this.peopleFor([schoolId])
      rowCounts['account/people'] = people.length
      entries.push({
        name: 'account/people.csv',
        data: Buffer.from(toCsv(people, ['userId', 'email', 'firstName', 'lastName', 'role', 'title']), 'utf8'),
      })

      entries.push({
        name: 'README.txt',
        data: Buffer.from(this.readme(schoolName, rowCounts), 'utf8'),
      })

      const zip = this.sealed(entries)
      // UNDER THE SCHOOL'S OWN PREFIX, so deleting the school takes the archive
      // with it. A top-level exports/ key sat outside the prefix that
      // schools.service.deleteSchool purges, which meant a complete copy of a
      // deleted school's records — every student, every gift — survived the
      // deletion that was supposed to remove them, indefinitely.
      const key = `${this.storage.schoolPrefix(schoolId)}exports/${jobId}.zip`
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

  /**
   * Build the archive, refusing rather than exhausting the process.
   *
   * The message is written for the person who sees it: it says what to do next
   * instead of "export failed", because the school still needs its data and the
   * per-module exports on each page are a real answer while we lift this.
   */
  private sealed(entries: ZipEntry[]): Buffer {
    const raw = entries.reduce((acc, e) => acc + e.data.length, 0)
    if (raw > MAX_ARCHIVE_BYTES) {
      throw new Error(
        'This archive is larger than a single download can hold. Export one module at a time from its own page, ' +
          'or contact support@ourkyro.com and we will send it in parts.',
      )
    }
    return buildZip(entries)
  }

  /**
   * Mark orphaned jobs failed. Called on every list, which is the cheapest place
   * to notice: the only reader of a stuck row is the page that polls it.
   */
  private async reapStale(where: { schoolId?: string; organizationId?: string }): Promise<void> {
    // EXPIRY HAS TO DELETE THE FILE, not merely refuse to sign a URL for it.
    // "Available for seven days, then the file is removed" is what the page and
    // the privacy policy both say; without this the object lives forever and the
    // sentence is false.
    const expired = await this.prisma.dataExport
      .findMany({
        where: { ...where, fileKey: { not: null }, expiresAt: { lt: new Date() } },
        select: { id: true, fileKey: true },
      })
      .catch(() => [] as Array<{ id: string; fileKey: string | null }>)
    for (const job of expired) {
      try {
        if (job.fileKey) await this.storage.deleteObject(job.fileKey)
        await this.prisma.dataExport.update({ where: { id: job.id }, data: { fileKey: null } })
      } catch {
        // Best effort — a storage hiccup must not break the listing.
      }
    }

    await this.prisma.dataExport
      .updateMany({
        where: {
          ...where,
          status: 'running',
          createdAt: { lt: new Date(Date.now() - STALE_JOB_MINUTES * 60 * 1000) },
        },
        data: {
          status: 'failed',
          error: 'This export was interrupted before it finished. Start a new one — nothing was lost.',
        },
      })
      .catch(() => undefined)
  }

  /**
   * The people behind the ids. Membership rows and audit entries name a userId
   * and nothing else, so without this the two files a school would actually
   * reach for — who had access, and who did what — are columns of uuids.
   * Passwords and MFA secrets are never touched: this reads three columns.
   */
  private async peopleFor(schoolIds: string[]): Promise<Array<Record<string, unknown>>> {
    const memberships = await this.prisma.membership.findMany({
      where: { schoolId: { in: schoolIds } },
      select: {
        role: true,
        title: true,
        user: { select: { id: true, email: true, firstName: true, lastName: true } },
      },
    })
    return memberships
      .filter((m) => m.user)
      .map((m) => ({
        userId: m.user!.id,
        email: m.user!.email,
        firstName: m.user!.firstName,
        lastName: m.user!.lastName,
        role: m.role,
        title: m.title,
      }))
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
      // An org key is slug/folder/file, a school key is folder/file. Splitting
      // blind listed the org archive's FOLDER name where the file name goes, so
      // every school's contents read as a list of "finance, finance, finance".
      const parts = path.split('/')
      const file = parts.pop() as string
      const folder = parts.join('/')
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
