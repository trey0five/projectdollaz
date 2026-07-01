import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common'
import type { User } from '@finrep/db'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js'
import { RolesGuard } from '../common/guards/roles.guard.js'
import { Roles } from '../common/decorators/roles.decorator.js'
import { CurrentUser } from '../common/decorators/current-user.decorator.js'
import { EntitlementGuard } from '../billing/entitlement.guard.js'
import { RequiresModule } from '../billing/requires-module.decorator.js'
import { ImportsService } from './imports.service.js'
import { CreateImportDto } from './dto/create-import.dto.js'

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class ImportsController {
  constructor(private readonly imports: ImportsService) {}

  // Store an immutable import (create-or-gets the period). owner/accountant only.
  // Gated by EntitlementGuard (402 when the trial has lapsed / sub is inactive).
  @Post('schools/:schoolId/imports')
  @Roles('owner', 'accountant')
  @UseGuards(EntitlementGuard)
  @RequiresModule('finance')
  create(
    @CurrentUser() user: User,
    @Param('schoolId') schoolId: string,
    @Body() dto: CreateImportDto,
  ) {
    return this.imports.create(user, schoolId, dto)
  }

  // List imports for a period (newest-first, active-flagged). Any active member.
  @Get('schools/:schoolId/periods/:periodId/imports')
  @Roles('owner', 'accountant', 'viewer')
  listForPeriod(
    @Param('schoolId') schoolId: string,
    @Param('periodId') periodId: string,
  ) {
    return this.imports.listForPeriod(schoolId, periodId)
  }

  // Full import (incl. rows), tenant-scoped. Any active member.
  @Get('schools/:schoolId/imports/:importId')
  @Roles('owner', 'accountant', 'viewer')
  getOne(
    @Param('schoolId') schoolId: string,
    @Param('importId') importId: string,
  ) {
    return this.imports.getOne(schoolId, importId)
  }

  // Delete a stored trial balance and reconcile the period's statements
  // (regenerate without it, or clear the snapshot when no CY remains).
  // owner/accountant only. Not entitlement-gated — cleanup must stay possible
  // even if the trial has lapsed.
  @Delete('schools/:schoolId/imports/:importId')
  @Roles('owner', 'accountant')
  remove(
    @CurrentUser() user: User,
    @Param('schoolId') schoolId: string,
    @Param('importId') importId: string,
  ) {
    return this.imports.remove(user, schoolId, importId)
  }
}
