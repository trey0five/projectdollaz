import { BadRequestException, Injectable } from '@nestjs/common'
import type { Prisma } from '@finrep/db'
import {
  defaultDashboardLayout,
  validateDashboardLayout,
} from '@finrep/analytics'
import type { DashboardLayout } from '@finrep/analytics'
import { PrismaService } from '../prisma/prisma.service.js'
import { AuditService } from '../common/audit/audit.service.js'

/** JSON-safe envelope returned to the client for the dashboard layout. */
export interface DashboardPublic {
  layout: DashboardLayout
  /** true when no row is saved and the registry-default layout is returned. */
  isDefault: boolean
  updatedAt: string | null
  updatedByUserId: string | null
}

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * GET — the saved per-school layout, or the registry DEFAULT (isDefault:true)
   * when none saved. Tenant isolation is enforced by RolesGuard membership on
   * :schoolId (every other controller relies on the same), so no extra check
   * here. Always returns a usable layout.
   */
  async getLayout(schoolId: string): Promise<DashboardPublic> {
    const row = await this.prisma.analyticsDashboard.findUnique({
      where: { schoolId },
    })
    if (!row) {
      return {
        layout: defaultDashboardLayout(),
        isDefault: true,
        updatedAt: null,
        updatedByUserId: null,
      }
    }
    // The stored layout is only ever written through validateDashboardLayout
    // below, so this cast is safe (the persisted shape is canonical).
    return {
      layout: row.layout as unknown as DashboardLayout,
      isDefault: false,
      updatedAt: row.updatedAt.toISOString(),
      updatedByUserId: row.updatedByUserId,
    }
  }

  /**
   * PUT — owner-only upsert. The raw layout is STRICTLY validated by the shared
   * @finrep/analytics helper (unknown key / duplicate / empty / bad enum / bad
   * visible -> 400) and stored NORMALIZED. Audited as 'dashboard.updated'.
   */
  async saveLayout(
    schoolId: string,
    rawLayout: unknown,
    userId: string,
  ): Promise<DashboardPublic> {
    const result = validateDashboardLayout(rawLayout)
    if (!result.ok) {
      throw new BadRequestException(result.error)
    }
    const layout = result.value

    const row = await this.prisma.analyticsDashboard.upsert({
      where: { schoolId },
      create: {
        schoolId,
        layout: layout as unknown as Prisma.InputJsonValue,
        updatedByUserId: userId,
      },
      update: {
        layout: layout as unknown as Prisma.InputJsonValue,
        updatedByUserId: userId,
      },
    })

    await this.audit.write({
      schoolId,
      userId,
      action: 'dashboard.updated',
      targetType: 'analytics_dashboard',
      targetId: row.id,
      metadata: {
        count: layout.length,
        hidden: layout.filter((i) => !i.visible).map((i) => i.metricKey),
      },
    })

    return {
      layout,
      isDefault: false,
      updatedAt: row.updatedAt.toISOString(),
      updatedByUserId: row.updatedByUserId,
    }
  }

  /**
   * DELETE (optional) — owner-only reset to default. Idempotent: deleting a
   * non-existent row is a no-op. Returns the registry default (isDefault:true).
   */
  async resetLayout(schoolId: string, userId: string): Promise<DashboardPublic> {
    await this.prisma.analyticsDashboard.deleteMany({ where: { schoolId } })
    await this.audit.write({
      schoolId,
      userId,
      action: 'dashboard.reset',
      targetType: 'analytics_dashboard',
      targetId: schoolId,
    })
    return {
      layout: defaultDashboardLayout(),
      isDefault: true,
      updatedAt: null,
      updatedByUserId: null,
    }
  }
}
