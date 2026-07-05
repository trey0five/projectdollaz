import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common'
import type { User } from '@finrep/db'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js'
import { RolesGuard } from '../common/guards/roles.guard.js'
import { Roles } from '../common/decorators/roles.decorator.js'
import { CurrentUser } from '../common/decorators/current-user.decorator.js'
import { EntitlementGuard } from '../billing/entitlement.guard.js'
import { QboService } from './qbo.service.js'
import { QbCallbackDto, QbSyncDto, QbSyncScopeDto } from './dto/qbo.dto.js'

/**
 * Phase 6 — QuickBooks Online connector. Membership-checked by RolesGuard on
 * :schoolId. Reads open to all roles; connect/sync/disconnect are owner/accountant.
 */
@Controller('schools/:schoolId/integrations/qb')
@UseGuards(JwtAuthGuard, RolesGuard, EntitlementGuard)
export class QboController {
  constructor(private readonly qbo: QboService) {}

  @Get('status')
  @Roles('owner', 'accountant', 'viewer')
  status(@Param('schoolId') schoolId: string) {
    return this.qbo.status(schoolId)
  }

  /** Returns the Intuit consent URL for the frontend to redirect to. */
  @Get('connect')
  @Roles('owner', 'accountant')
  connect(@Param('schoolId') schoolId: string) {
    return { url: this.qbo.authorizeUrl(schoolId) }
  }

  /** OAuth callback: the frontend posts the code + realmId it received from Intuit. */
  @Post('callback')
  @Roles('owner', 'accountant')
  callback(
    @Param('schoolId') schoolId: string,
    @Body() dto: QbCallbackDto,
    @CurrentUser() user: User,
  ) {
    return this.qbo.connect(schoolId, dto.code, dto.realmId, user.id)
  }

  @Delete()
  @Roles('owner', 'accountant')
  disconnect(@Param('schoolId') schoolId: string, @CurrentUser() user: User) {
    return this.qbo.disconnect(schoolId, user.id)
  }

  /** Pull the trial balance for a period and generate a snapshot (auto-scanned). */
  @Post('sync')
  @Roles('owner', 'accountant')
  sync(@Param('schoolId') schoolId: string, @Body() dto: QbSyncDto, @CurrentUser() user: User) {
    return this.qbo.sync(user, schoolId, dto.periodId)
  }

  /** Scoped import: pull a chosen mix (current/prior year, monthly, history) at once. */
  @Post('sync-scope')
  @Roles('owner', 'accountant')
  syncScope(
    @Param('schoolId') schoolId: string,
    @Body() dto: QbSyncScopeDto,
    @CurrentUser() user: User,
  ) {
    return this.qbo.syncScope(user, schoolId, dto)
  }

  /** Recent 'qbo.synced' audit rows (newest-first, capped). Read-open like status. */
  @Get('sync-history')
  @Roles('owner', 'accountant', 'viewer')
  syncHistory(@Param('schoolId') schoolId: string) {
    return this.qbo.syncHistory(schoolId)
  }

  /**
   * Sync every period for the school (resilient: one period's failure doesn't abort
   * the batch). No request body — nothing to whitelist. Owner/accountant like sync.
   */
  @Post('sync-all')
  @Roles('owner', 'accountant')
  syncAll(@Param('schoolId') schoolId: string, @CurrentUser() user: User) {
    return this.qbo.syncAll(user, schoolId)
  }
}
