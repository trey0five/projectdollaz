import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common'
import type { User } from '@finrep/db'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js'
import { RolesGuard } from '../common/guards/roles.guard.js'
import { Roles } from '../common/decorators/roles.decorator.js'
import { CurrentUser } from '../common/decorators/current-user.decorator.js'
import { EntitlementGuard } from '../billing/entitlement.guard.js'
import { MonthlySnapshotsService } from './monthly-snapshots.service.js'
import { MonthlyActualsService } from './monthly-actuals.service.js'
import { CreateMonthlySnapshotDto } from './dto/create-monthly-snapshot.dto.js'
import { ParseMonthKeyPipe } from './parse-month-key.pipe.js'

/**
 * MONTHLY actuals foundation (additive "Option B"). Per-month TB ingest +
 * derived MTD/YTD actuals. Mirrors the imports/statements controller
 * conventions: JwtAuthGuard + RolesGuard everywhere; EntitlementGuard on the two
 * write endpoints. Annual routes untouched.
 */
@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class MonthlyController {
  constructor(
    private readonly snapshots: MonthlySnapshotsService,
    private readonly actuals: MonthlyActualsService,
  ) {}

  // Upsert a month's TB (engine CY-only). owner/accountant; entitlement-gated.
  @Post('schools/:schoolId/periods/:periodId/monthly-snapshots')
  @Roles('owner', 'accountant')
  @UseGuards(EntitlementGuard)
  create(
    @CurrentUser() user: User,
    @Param('schoolId') schoolId: string,
    @Param('periodId') periodId: string,
    @Body() dto: CreateMonthlySnapshotDto,
  ) {
    return this.snapshots.create(user, schoolId, periodId, dto)
  }

  // Lightweight list of loaded months for a period. Any active member.
  @Get('schools/:schoolId/periods/:periodId/monthly-snapshots')
  @Roles('owner', 'accountant', 'viewer')
  list(
    @Param('schoolId') schoolId: string,
    @Param('periodId') periodId: string,
  ) {
    return this.snapshots.list(schoolId, periodId)
  }

  // Delete a loaded month. owner/accountant; entitlement-gated. 204 / 404.
  @Delete('schools/:schoolId/periods/:periodId/monthly-snapshots/:monthKey')
  @Roles('owner', 'accountant')
  @UseGuards(EntitlementGuard)
  @HttpCode(204)
  remove(
    @CurrentUser() user: User,
    @Param('schoolId') schoolId: string,
    @Param('periodId') periodId: string,
    @Param('monthKey', ParseMonthKeyPipe) monthKey: string,
  ) {
    return this.snapshots.remove(user, schoolId, periodId, monthKey)
  }

  // Derived MTD/YTD actuals + point-in-time balance sheet + metrics for a month
  // (defaults to the latest loaded month). Any active member.
  @Get('schools/:schoolId/periods/:periodId/monthly-actuals')
  @Roles('owner', 'accountant', 'viewer')
  getActuals(
    @Param('schoolId') schoolId: string,
    @Param('periodId') periodId: string,
    @Query('month') month?: string,
  ) {
    return this.actuals.actuals(schoolId, periodId, month)
  }
}
