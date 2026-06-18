import {
  Body,
  Controller,
  Delete,
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
import { DisbursementsService } from './disbursements.service.js'
import { ReconciliationService } from './reconciliation.service.js'
import { ReplaceDisbursementsDto } from './dto/replace-disbursements.dto.js'

/**
 * Phase 2B — scholarship disbursements intake + reconciliation. Same guard
 * stack/order as the rest of the ComplianceModule (JwtAuthGuard 401 -> RolesGuard
 * 403 -> EntitlementGuard 402). Reads open to all roles; writes are
 * owner/accountant. Tenant-isolated via getOwnedPeriod inside the services.
 */
@Controller('schools/:schoolId')
@UseGuards(JwtAuthGuard, RolesGuard, EntitlementGuard)
export class ReconciliationController {
  constructor(
    private readonly disbursements: DisbursementsService,
    private readonly reconciliation: ReconciliationService,
  ) {}

  @Get('periods/:periodId/disbursements')
  @Roles('owner', 'accountant', 'viewer')
  list(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Param('periodId', ParseUUIDPipe) periodId: string,
  ) {
    return this.disbursements.list(schoolId, periodId)
  }

  /** REPLACE the period's disbursement set with a validated array of parsed rows. */
  @Put('periods/:periodId/disbursements')
  @Roles('owner', 'accountant')
  replace(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Param('periodId', ParseUUIDPipe) periodId: string,
    @Body() dto: ReplaceDisbursementsDto,
    @CurrentUser() user: User,
  ) {
    return this.disbursements.replace(schoolId, periodId, dto.rows, user.id)
  }

  /** Clear the whole set. */
  @Delete('periods/:periodId/disbursements')
  @Roles('owner', 'accountant')
  clear(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Param('periodId', ParseUUIDPipe) periodId: string,
    @CurrentUser() user: User,
  ) {
    return this.disbursements.clear(schoolId, periodId, user.id)
  }

  /** Run the pure reconciliation: disbursements vs recorded scholarship revenue. */
  @Get('periods/:periodId/reconciliation')
  @Roles('owner', 'accountant', 'viewer')
  reconcile(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Param('periodId', ParseUUIDPipe) periodId: string,
  ) {
    return this.reconciliation.reconcileForPeriod(schoolId, periodId)
  }
}
