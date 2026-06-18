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
}
