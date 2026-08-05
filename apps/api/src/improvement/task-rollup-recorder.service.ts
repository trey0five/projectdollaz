import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { Prisma } from '@finrep/db'
import { PrismaService } from '../prisma/prisma.service.js'

/**
 * AIC hand-off — THE MISSING NIGHTLY RECORDER for `task_rollup` progress events.
 *
 * The schema comment on ImprovementProgressEvent has referred to "the nightly
 * recorder" since Phase G; this is the first time it exists. What starved
 * without it: the diocesan portfolio's VELOCITY (`portfolio.service.ts`)
 * measures movement by differencing progress events filtered on
 * `event.source === initiative.progressSource` — and nothing ever wrote a
 * `task_rollup` event, so a school whose improvement work is all task-rollup
 * reported `basis: 'insufficient'` forever, even though its linked-task
 * completion was fully known and moving. Meanwhile the SAME initiatives DID
 * count toward the rollup score (`countsTowardRollup` includes 'task_rollup'),
 * so the portfolio claimed the work in one number and could not observe it in
 * the other.
 *
 * What this deliberately does NOT do:
 *   • It does not touch `lastProgressAt` — that field answers "when did a person
 *     last attend to this", and a machine observation refreshing it daily would
 *     kill every staleness nudge built on it.
 *   • It does not audit — `improvement.progress.recorded` is the record of a
 *     user act, and forty machine rows a night would bury the real ones.
 *   • It does not write when an initiative has NO linked tasks: 0/0 is not "0%
 *     done", it is nothing to observe, and recording it would draw a flat line
 *     under an initiative the school simply hasn't wired up yet.
 *   • It never projects — `task_rollup` stays outside PROJECTABLE by design
 *     ("task counts are not a measured series"); these events feed VELOCITY
 *     (two real observations differenced), which is a different, honest claim.
 *
 * Idempotent BY THE TABLE'S OWN KEY: the upsert on
 * (initiativeId, observedOn, source) means a re-run within the same day updates
 * today's reading in place — the design the unique index anticipated.
 */
const SWEEP_INTERVAL_MS = 6 * 60 * 60 * 1000 // idempotent, so 4×/day is just fresher
const FIRST_SWEEP_DELAY_MS = 90_000 // let the container settle; catches up on boot
const CLOSED_STATUSES = ['done', 'cancelled'] as const

@Injectable()
export class TaskRollupRecorderService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TaskRollupRecorderService.name)
  private timer: NodeJS.Timeout | null = null

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit(): void {
    this.timer = setInterval(() => void this.sweep(), SWEEP_INTERVAL_MS)
    setTimeout(() => void this.sweep(), FIRST_SWEEP_DELAY_MS)
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer)
  }

  /**
   * One pass over every OPEN task-rollup initiative, all schools. Returns the
   * number of events written — the spec drives this directly, and the log line
   * keeps the job observable in production without a metrics stack.
   */
  async sweep(now: Date = new Date()): Promise<number> {
    try {
      const initiatives = await this.prisma.improvementInitiative.findMany({
        where: {
          progressSource: 'task_rollup',
          status: { notIn: [...CLOSED_STATUSES] },
        },
        select: { id: true, schoolId: true },
      })
      if (initiatives.length === 0) return 0

      // ONE groupBy for the whole fleet — the same shape ImprovementService's
      // linkedTaskCounts uses (sourceType 'strategy', sourceRef = initiative id),
      // kept schoolId-unscoped here because the ids themselves are the scope.
      const ids = initiatives.map((i) => i.id)
      const grouped = await this.prisma.task.groupBy({
        by: ['sourceRef', 'status'],
        where: { sourceType: 'strategy', sourceRef: { in: ids } },
        _count: { _all: true },
      })
      const counts = new Map<string, { total: number; done: number }>()
      for (const row of grouped) {
        if (!row.sourceRef) continue
        const bucket = counts.get(row.sourceRef) ?? { total: 0, done: 0 }
        bucket.total += row._count._all
        if (row.status === 'done') bucket.done += row._count._all
        counts.set(row.sourceRef, bucket)
      }

      // The DAY is the observation key. UTC-truncated exactly as the manual
      // recorder's parseIsoDate produces, so a machine row and a hand-entered row
      // for the same day collide on the unique index instead of duplicating.
      const observedOn = new Date(`${now.toISOString().slice(0, 10)}T00:00:00.000Z`)

      let written = 0
      for (const ini of initiatives) {
        const c = counts.get(ini.id)
        if (!c || c.total === 0) continue // nothing to observe — see the header
        const pct = c.done / c.total
        await this.prisma.improvementProgressEvent.upsert({
          where: {
            initiativeId_observedOn_source: {
              initiativeId: ini.id,
              observedOn,
              source: 'task_rollup',
            },
          },
          create: {
            schoolId: ini.schoolId,
            initiativeId: ini.id,
            observedOn,
            source: 'task_rollup',
            value: new Prisma.Decimal(c.done),
            pct: new Prisma.Decimal(pct),
            note: null,
            createdByUserId: null,
          },
          update: {
            value: new Prisma.Decimal(c.done),
            pct: new Prisma.Decimal(pct),
          },
        })
        written += 1
      }
      if (written > 0) this.logger.log(`task-rollup recorder: ${written} observation(s)`)
      return written
    } catch (e) {
      // Never throws to the loop — the next sweep tries again.
      this.logger.warn(`task-rollup recorder sweep failed: ${(e as Error).message}`)
      return 0
    }
  }
}
