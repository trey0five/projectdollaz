import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Put,
  UseGuards,
} from '@nestjs/common'
import type { User } from '@finrep/db'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js'
import { RolesGuard } from '../common/guards/roles.guard.js'
import { Roles } from '../common/decorators/roles.decorator.js'
import { CurrentUser } from '../common/decorators/current-user.decorator.js'
import { EntitlementGuard } from '../billing/entitlement.guard.js'
import { ChecklistService } from './checklist.service.js'
import { UpsertChecklistDto } from './dto/upsert-checklist.dto.js'

/**
 * Phase 2C — Year-End Review Readiness checklist. Same guard stack/order as the
 * rest of the ComplianceModule (JwtAuthGuard 401 -> RolesGuard 403 ->
 * EntitlementGuard 402). GET is open to all roles; PUT is owner/accountant.
 * Tenant-isolated via getOwnedPeriod inside the service. ParseUUIDPipe -> bad
 * UUID 400/403.
 */
@Controller('schools/:schoolId')
@UseGuards(JwtAuthGuard, RolesGuard, EntitlementGuard)
export class ChecklistController {
  constructor(private readonly checklist: ChecklistService) {}

  /** Build the checklist, merge saved state, annotate live-finding context + rollup. */
  @Get('periods/:periodId/checklist')
  @Roles('owner', 'accountant', 'viewer')
  get(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Param('periodId', ParseUUIDPipe) periodId: string,
  ) {
    return this.checklist.getChecklist(schoolId, periodId)
  }

  /** Upsert checklist item state (owner/accountant). Returns the fresh checklist. */
  @Put('periods/:periodId/checklist')
  @Roles('owner', 'accountant')
  upsert(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Param('periodId', ParseUUIDPipe) periodId: string,
    @Body() dto: UpsertChecklistDto,
    @CurrentUser() user: User,
  ) {
    return this.checklist.upsertItems(schoolId, periodId, dto, user.id)
  }
}
