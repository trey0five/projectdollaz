import { Injectable, Logger } from '@nestjs/common'
import type { Prisma } from '@finrep/db'
import { PrismaService } from '../../prisma/prisma.service.js'

export interface AuditEntry {
  organizationId?: string | null
  schoolId?: string | null
  /** The actor performing the action. */
  userId?: string | null
  action: string
  targetType?: string | null
  targetId?: string | null
  metadata?: Prisma.InputJsonValue | null
}

/**
 * Shared best-effort audit writer. Records role changes, removals, invite
 * revokes, school/org updates, profile + password changes. Never includes
 * secrets in metadata (no passwords, hashes, tokens). A write failure is logged
 * but never blocks the mutation it accompanies.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name)

  constructor(private readonly prisma: PrismaService) {}

  async write(entry: AuditEntry): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          organizationId: entry.organizationId ?? null,
          schoolId: entry.schoolId ?? null,
          userId: entry.userId ?? null,
          action: entry.action,
          targetType: entry.targetType ?? null,
          targetId: entry.targetId ?? null,
          metadata: entry.metadata ?? undefined,
        },
      })
    } catch (err) {
      this.logger.warn(`Failed to write audit log for ${entry.action}: ${String(err)}`)
    }
  }

  /**
   * Like {@link write}, but returns the new row's id so a caller (Penny's action
   * log) can reference this entry later — e.g. to render an inline Undo keyed on it,
   * or to record a matching `undone` marker. Still best-effort: on a write failure it
   * logs and returns null rather than throwing, so it never blocks the mutation it
   * accompanies. Callers must treat a null id as "no log entry" (no Undo offered).
   */
  async writeReturning(entry: AuditEntry): Promise<string | null> {
    try {
      const row = await this.prisma.auditLog.create({
        data: {
          organizationId: entry.organizationId ?? null,
          schoolId: entry.schoolId ?? null,
          userId: entry.userId ?? null,
          action: entry.action,
          targetType: entry.targetType ?? null,
          targetId: entry.targetId ?? null,
          metadata: entry.metadata ?? undefined,
        },
        select: { id: true },
      })
      return row.id
    } catch (err) {
      this.logger.warn(`Failed to write audit log for ${entry.action}: ${String(err)}`)
      return null
    }
  }
}
