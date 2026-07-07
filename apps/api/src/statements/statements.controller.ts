import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common'
import type { User } from '@finrep/db'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js'
import { RolesGuard } from '../common/guards/roles.guard.js'
import { Roles } from '../common/decorators/roles.decorator.js'
import { CurrentUser } from '../common/decorators/current-user.decorator.js'
import { EntitlementGuard } from '../billing/entitlement.guard.js'
import { RequiresModule } from '../billing/requires-module.decorator.js'
import { StatementsService } from './statements.service.js'
import { SnapshotHistoryService } from './snapshot-history.service.js'
import { GenerateStatementDto } from './dto/generate-statement.dto.js'
import { ValueHistoryDto } from './dto/value-history.dto.js'

@Controller('schools/:schoolId/periods/:periodId/statements')
@UseGuards(JwtAuthGuard, RolesGuard)
export class StatementsController {
  constructor(
    private readonly statements: StatementsService,
    private readonly history: SnapshotHistoryService,
  ) {}

  // Generate + persist the canonical snapshot. owner/accountant only. Gated by
  // EntitlementGuard (402 when the school's trial has lapsed / sub is inactive).
  @Post()
  @Roles('owner', 'accountant')
  @UseGuards(EntitlementGuard)
  @RequiresModule('finance')
  generate(
    @CurrentUser() user: User,
    @Param('schoolId') schoolId: string,
    @Param('periodId') periodId: string,
    @Body() dto: GenerateStatementDto,
  ) {
    return this.statements.generate(user, schoolId, periodId, dto)
  }

  // Latest snapshot for the period. Any active member.
  @Get()
  @Roles('owner', 'accountant', 'viewer')
  latest(
    @Param('schoolId') schoolId: string,
    @Param('periodId') periodId: string,
  ) {
    return this.statements.latest(schoolId, periodId)
  }

  // Regeneration history (version-stamped metadata only). Any active member.
  @Get('history')
  @Roles('owner', 'accountant', 'viewer')
  list(
    @Param('schoolId') schoolId: string,
    @Param('periodId') periodId: string,
  ) {
    return this.statements.list(schoolId, periodId)
  }

  // Value history — how a single line/metric moved across the period's snapshot
  // chain (audit trail / value-versioning). Read-only, viewer-safe (same access as
  // latest/history); no EntitlementGuard on a read. periodId is the path param.
  @Post('value-history')
  @Roles('owner', 'accountant', 'viewer')
  valueHistory(
    @Param('schoolId') schoolId: string,
    @Param('periodId') periodId: string,
    @Body() dto: ValueHistoryDto,
  ) {
    return this.history.valueHistory(schoolId, periodId, dto)
  }
}
