import { Body, Controller, Delete, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common'
import type { User } from '@finrep/db'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js'
import { RolesGuard } from '../common/guards/roles.guard.js'
import { Roles } from '../common/decorators/roles.decorator.js'
import { CurrentUser } from '../common/decorators/current-user.decorator.js'
import { EntitlementGuard } from '../billing/entitlement.guard.js'
import { RequiresModule } from '../billing/requires-module.decorator.js'
import { StrategyService } from './strategy.service.js'
import { CreatePillarDto } from './dto/create-pillar.dto.js'
import { UpdatePillarDto } from './dto/update-pillar.dto.js'

/** Phase 5 Strategic Planning — the PILLARS controller. Same guard chain + entitlement
 *  as PlansController; owner/accountant WRITE only (pillars are structural edits). */
@Controller('schools/:schoolId/strategy')
@UseGuards(JwtAuthGuard, RolesGuard, EntitlementGuard)
@RequiresModule('strategy')
export class PillarsController {
  constructor(private readonly strategy: StrategyService) {}

  @Post('plans/:planId/pillars')
  @Roles('owner', 'accountant')
  create(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Param('planId', ParseUUIDPipe) planId: string,
    @Body() dto: CreatePillarDto,
    @CurrentUser() user: User,
  ) {
    return this.strategy.createPillar(schoolId, planId, dto, user.id)
  }

  @Patch('pillars/:pillarId')
  @Roles('owner', 'accountant')
  update(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Param('pillarId', ParseUUIDPipe) pillarId: string,
    @Body() dto: UpdatePillarDto,
    @CurrentUser() user: User,
  ) {
    return this.strategy.updatePillar(schoolId, pillarId, dto, user.id)
  }

  @Delete('pillars/:pillarId')
  @Roles('owner', 'accountant')
  remove(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Param('pillarId', ParseUUIDPipe) pillarId: string,
    @CurrentUser() user: User,
  ) {
    return this.strategy.removePillar(schoolId, pillarId, user.id)
  }
}
