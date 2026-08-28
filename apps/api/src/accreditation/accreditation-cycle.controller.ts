import { Body, Controller, Get, Param, ParseUUIDPipe, Put, Query, UseGuards } from '@nestjs/common'
import type { User } from '@finrep/db'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js'
import { RolesGuard } from '../common/guards/roles.guard.js'
import { Roles } from '../common/decorators/roles.decorator.js'
import { CurrentUser } from '../common/decorators/current-user.decorator.js'
import { EntitlementGuard } from '../billing/entitlement.guard.js'
import { RequiresModule } from '../billing/requires-module.decorator.js'
import { AccreditationCycleService } from './accreditation-cycle.service.js'
import { CycleQueryDto } from './dto/cycle-query.dto.js'
import { SetCycleDto } from './dto/set-cycle.dto.js'

/**
 * WS3 F1 — the six-year CYCLE routes. GET composes the journey payload (phase,
 * countdown, six milestones — every string server-authored); PUT writes the
 * anchor onto the framework profile row. Same guard chain + entitlement as the
 * rest of the accreditation module. GET is open to every role (a committee
 * member reads the road); PUT writes metadata → owner/accountant.
 */
@Controller('schools/:schoolId/accreditation/cycle')
@UseGuards(JwtAuthGuard, RolesGuard, EntitlementGuard)
@RequiresModule('accreditation')
export class AccreditationCycleController {
  constructor(private readonly cycle: AccreditationCycleService) {}

  @Get()
  @Roles('owner', 'accountant', 'viewer')
  get(@Param('schoolId', ParseUUIDPipe) schoolId: string, @Query() query: CycleQueryDto) {
    return this.cycle.getCycle(schoolId, { frameworkId: query.frameworkId })
  }

  @Put()
  @Roles('owner', 'accountant')
  put(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Body() dto: SetCycleDto,
    @CurrentUser() user: User,
  ) {
    return this.cycle.setCycle(schoolId, dto, user.id)
  }
}
