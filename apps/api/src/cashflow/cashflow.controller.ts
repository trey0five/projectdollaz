import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Put, Query, UseGuards } from '@nestjs/common'
import type { User } from '@finrep/db'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js'
import { RolesGuard } from '../common/guards/roles.guard.js'
import { Roles } from '../common/decorators/roles.decorator.js'
import { CurrentUser } from '../common/decorators/current-user.decorator.js'
import { EntitlementGuard } from '../billing/entitlement.guard.js'
import { RequiresModule } from '../billing/requires-module.decorator.js'
import { CashFlowService } from './cashflow.service.js'
import { ProjectCashDto } from './dto/project-cash.dto.js'
import { SaveCommitmentDto } from './dto/save-commitment.dto.js'
import { SaveAssumptionsDto } from './dto/save-assumptions.dto.js'

/**
 * CASH FLOW PROJECTION — the forward cash view.
 *
 * `@RequiresModule('finance', 'planning')` with OR semantics: the data sources
 * are all finance (trial balances, budgets, receivables) while the feature itself
 * is a forward look, which is planning's territory. A school licensed for either
 * gets it, rather than being asked to buy both for one screen.
 *
 * PROJECTING IS A POST, and it is a POST because it WRITES — every run is frozen
 * on creation so a forecast can be compared against the actual later. Reads are
 * open to viewers (a board member is exactly the audience for "when do we run
 * out"); anything that changes a commitment or an assumption is owner/accountant,
 * the same split the rest of the finance surface uses.
 */
@Controller('schools/:schoolId/cash-flow')
@UseGuards(JwtAuthGuard, RolesGuard, EntitlementGuard)
@RequiresModule('finance', 'planning')
export class CashFlowController {
  constructor(private readonly cashflow: CashFlowService) {}

  /** The last stated opening balance, with the trial-balance figure beside it. */
  @Get('opening')
  @Roles('owner', 'accountant', 'viewer')
  opening(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Query('today') today?: string,
  ) {
    // `today` is a caller-supplied ISO date so the staleness reading is testable
    // and does not depend on server clock skew. Falls back to the server's day.
    return this.cashflow.getOpening(schoolId, today ?? new Date().toISOString().slice(0, 10))
  }

  @Post('project')
  @Roles('owner', 'accountant', 'viewer')
  project(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @CurrentUser() user: User,
    @Body() dto: ProjectCashDto,
  ) {
    return this.cashflow.project(schoolId, user.id, dto)
  }

  // ── Commitments ────────────────────────────────────────────────────────────

  @Get('commitments')
  @Roles('owner', 'accountant', 'viewer')
  listCommitments(@Param('schoolId', ParseUUIDPipe) schoolId: string) {
    return this.cashflow.listCommitments(schoolId)
  }

  @Post('commitments')
  @Roles('owner', 'accountant')
  createCommitment(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @CurrentUser() user: User,
    @Body() dto: SaveCommitmentDto,
  ) {
    return this.cashflow.createCommitment(schoolId, user.id, dto as unknown as Record<string, unknown>)
  }

  @Patch('commitments/:commitmentId')
  @Roles('owner', 'accountant')
  updateCommitment(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Param('commitmentId', ParseUUIDPipe) commitmentId: string,
    @Body() dto: SaveCommitmentDto,
  ) {
    return this.cashflow.updateCommitment(schoolId, commitmentId, dto as unknown as Record<string, unknown>)
  }

  @Delete('commitments/:commitmentId')
  @Roles('owner', 'accountant')
  removeCommitment(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Param('commitmentId', ParseUUIDPipe) commitmentId: string,
  ) {
    return this.cashflow.removeCommitment(schoolId, commitmentId)
  }

  // ── Assumptions ────────────────────────────────────────────────────────────

  @Get('assumptions')
  @Roles('owner', 'accountant', 'viewer')
  getAssumptions(@Param('schoolId', ParseUUIDPipe) schoolId: string) {
    return this.cashflow.getAssumptions(schoolId)
  }

  @Put('assumptions')
  @Roles('owner', 'accountant')
  saveAssumptions(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @CurrentUser() user: User,
    @Body() dto: SaveAssumptionsDto,
  ) {
    return this.cashflow.saveAssumptions(schoolId, user.id, dto as unknown as Record<string, unknown>)
  }
}
