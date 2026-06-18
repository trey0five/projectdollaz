import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Put,
  UseGuards,
} from '@nestjs/common'
import { IsBoolean } from 'class-validator'
import type { User } from '@finrep/db'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js'
import { RolesGuard } from '../common/guards/roles.guard.js'
import { Roles } from '../common/decorators/roles.decorator.js'
import { CurrentUser } from '../common/decorators/current-user.decorator.js'
import { EntitlementGuard } from '../billing/entitlement.guard.js'
import { CorrectiveActionService } from './corrective-action.service.js'
import { UpsertCorrectiveActionDto } from './dto/upsert-corrective-action.dto.js'

class SetArchivedDto {
  @IsBoolean()
  archived!: boolean
}

/**
 * Phase 2D — Corrective Action Plan. Same guard stack/order as the rest of the
 * ComplianceModule (JwtAuthGuard 401 -> RolesGuard 403 -> EntitlementGuard 402).
 * GET is open to all roles; PUT is owner/accountant. Tenant-isolated via
 * getOwnedPeriod inside the service. ParseUUIDPipe -> bad UUID 400/403.
 */
@Controller('schools/:schoolId')
@UseGuards(JwtAuthGuard, RolesGuard, EntitlementGuard)
export class CorrectiveActionController {
  constructor(private readonly cap: CorrectiveActionService) {}

  /** Recompute the 2A findings, scaffold, and merge the saved CAP edits. */
  @Get('periods/:periodId/corrective-action-plan')
  @Roles('owner', 'accountant', 'viewer')
  get(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Param('periodId', ParseUUIDPipe) periodId: string,
  ) {
    return this.cap.getPlan(schoolId, periodId)
  }

  /** Upsert the editable CAP rows (owner/accountant). Returns the fresh plan. */
  @Put('periods/:periodId/corrective-action-plan')
  @Roles('owner', 'accountant')
  upsert(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Param('periodId', ParseUUIDPipe) periodId: string,
    @Body() dto: UpsertCorrectiveActionDto,
    @CurrentUser() user: User,
  ) {
    return this.cap.upsertEntries(schoolId, periodId, dto, user.id)
  }

  /** Dismiss (soft-archive) or restore a resolved CAP row (owner/accountant). */
  @Put('periods/:periodId/corrective-action-plan/:ruleId/archived')
  @Roles('owner', 'accountant')
  setArchived(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Param('periodId', ParseUUIDPipe) periodId: string,
    @Param('ruleId') ruleId: string,
    @Body() dto: SetArchivedDto,
    @CurrentUser() user: User,
  ) {
    return this.cap.setArchived(schoolId, periodId, ruleId, dto.archived, user.id)
  }
}
