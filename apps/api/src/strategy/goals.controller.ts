import { Body, Controller, Delete, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common'
import type { User } from '@finrep/db'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js'
import { RolesGuard } from '../common/guards/roles.guard.js'
import { Roles } from '../common/decorators/roles.decorator.js'
import { CurrentUser } from '../common/decorators/current-user.decorator.js'
import { EntitlementGuard } from '../billing/entitlement.guard.js'
import { RequiresModule } from '../billing/requires-module.decorator.js'
import { StrategyService } from './strategy.service.js'
import { CreateGoalDto } from './dto/create-goal.dto.js'
import { UpdateGoalDto } from './dto/update-goal.dto.js'

/** Phase 5 Strategic Planning — the GOALS controller (+ intentional rebaseline).
 *  Same guard chain + entitlement as PlansController; owner/accountant WRITE only. */
@Controller('schools/:schoolId/strategy')
@UseGuards(JwtAuthGuard, RolesGuard, EntitlementGuard)
@RequiresModule('strategy')
export class GoalsController {
  constructor(private readonly strategy: StrategyService) {}

  @Post('pillars/:pillarId/goals')
  @Roles('owner', 'accountant')
  create(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Param('pillarId', ParseUUIDPipe) pillarId: string,
    @Body() dto: CreateGoalDto,
    @CurrentUser() user: User,
  ) {
    return this.strategy.createGoal(schoolId, pillarId, dto, user.id)
  }

  @Patch('goals/:goalId')
  @Roles('owner', 'accountant')
  update(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Param('goalId', ParseUUIDPipe) goalId: string,
    @Body() dto: UpdateGoalDto,
    @CurrentUser() user: User,
  ) {
    return this.strategy.updateGoal(schoolId, goalId, dto, user.id)
  }

  @Delete('goals/:goalId')
  @Roles('owner', 'accountant')
  remove(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Param('goalId', ParseUUIDPipe) goalId: string,
    @CurrentUser() user: User,
  ) {
    return this.strategy.removeGoal(schoolId, goalId, user.id)
  }

  /** Intentional baseline RESET for a metric goal (refreeze to the current value). */
  @Post('goals/:goalId/rebaseline')
  @Roles('owner', 'accountant')
  rebaseline(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Param('goalId', ParseUUIDPipe) goalId: string,
    @CurrentUser() user: User,
  ) {
    return this.strategy.rebaseline(schoolId, goalId, user.id)
  }
}
