import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common'
import type { MembershipRole, User } from '@finrep/db'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js'
import { RolesGuard } from '../common/guards/roles.guard.js'
import { Roles } from '../common/decorators/roles.decorator.js'
import { CurrentUser } from '../common/decorators/current-user.decorator.js'
import { CallerRole } from '../common/decorators/caller-role.decorator.js'
import { FinanceInventoryService } from './finance-inventory.service.js'
import { FinanceRemovalsService } from './finance-removals.service.js'
import { CreateRemovalDto, RemovalTargetDto, RestoreRemovalDto } from './dto/removal.dto.js'

/**
 * Finance → Add data: "Already on file", Remove (with a preview of what it
 * affects) and Restore from "Recently removed". No EntitlementGuard on any
 * route — cleanup and undo must keep working after a trial lapses, the same as
 * the legacy import DELETE.
 */
@Controller('schools/:schoolId/finance')
@UseGuards(JwtAuthGuard, RolesGuard)
export class FinanceFilesController {
  constructor(
    private readonly inventory: FinanceInventoryService,
    private readonly removals: FinanceRemovalsService,
  ) {}

  // Every year's finance data. Any active member; Recently removed is editors-only.
  @Get('on-file')
  @Roles('owner', 'accountant', 'viewer')
  onFile(@Param('schoolId') schoolId: string, @CallerRole() role: MembershipRole | undefined) {
    return this.inventory.inventory(schoolId, role)
  }

  // What a removal would take and affect. Changes nothing.
  @Post('removals/preview')
  @Roles('owner', 'accountant')
  @HttpCode(200)
  preview(@Param('schoolId') schoolId: string, @Body() dto: RemovalTargetDto) {
    return this.removals.preview(schoolId, dto)
  }

  // Remove (restorable for 30 days). 201.
  @Post('removals')
  @Roles('owner', 'accountant')
  remove(
    @CurrentUser() user: User,
    @Param('schoolId') schoolId: string,
    @Body() dto: CreateRemovalDto,
  ) {
    return this.removals.remove(user, schoolId, dto)
  }

  // Put a removal back (optionally swapping out what fills the slot now). 200.
  @Post('removals/:removalId/restore')
  @Roles('owner', 'accountant')
  @HttpCode(200)
  restore(
    @CurrentUser() user: User,
    @Param('schoolId') schoolId: string,
    @Param('removalId', ParseUUIDPipe) removalId: string,
    @Body() dto: RestoreRemovalDto,
  ) {
    return this.removals.restore(user, schoolId, removalId, dto)
  }
}
