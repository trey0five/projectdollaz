import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common'
import type { User } from '@finrep/db'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js'
import { CurrentUser } from '../common/decorators/current-user.decorator.js'
import { QboOrgService } from './qbo-org.service.js'
import { QbOrgSyncDto } from './dto/qbo.dto.js'

/**
 * Org-level QuickBooks console: connection overview across every school in the
 * caller's org + one-click batch sync of all connected schools. JwtAuthGuard
 * ONLY — mirrors OrgBriefingController's org-scoped pattern (RolesGuard can't
 * resolve a schoolId for an org route and EntitlementGuard would 402 with no
 * school context); org isolation + per-school role/entitlement checks live in
 * QboOrgService. A further @Controller('organizations/:orgId') class is valid
 * in Nest because the sub-paths differ (integrations/qb/*).
 */
@Controller('organizations/:orgId/integrations/qb')
@UseGuards(JwtAuthGuard)
export class QboOrgController {
  constructor(private readonly qboOrg: QboOrgService) {}

  @Get('overview')
  overview(@CurrentUser() user: User, @Param('orgId') orgId: string) {
    return this.qboOrg.overview(user, orgId)
  }

  /** Batch scoped import for every connected school (or dto.schoolIds subset). */
  @Post('sync')
  sync(@CurrentUser() user: User, @Param('orgId') orgId: string, @Body() dto: QbOrgSyncDto) {
    return this.qboOrg.syncOrg(user, orgId, dto)
  }
}
