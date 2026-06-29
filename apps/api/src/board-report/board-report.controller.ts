import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common'
import type { User } from '@finrep/db'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js'
import { RolesGuard } from '../common/guards/roles.guard.js'
import { Roles } from '../common/decorators/roles.decorator.js'
import { CurrentUser } from '../common/decorators/current-user.decorator.js'
import { EntitlementGuard } from '../billing/entitlement.guard.js'
import { BoardReportService } from './board-report.service.js'
import { SaveBoardReportDto } from './dto/save-board-report.dto.js'
import { MdaBoardReportDto } from './dto/mda-board-report.dto.js'

/**
 * Phase-1 Board Report (NBOA-style finance-committee packet). Same guard stack as
 * BudgetController: GET open to all roles (it also powers the print page), writes
 * owner/accountant. Tenant-isolated inside the service via getOwnedPeriod.
 */
@Controller('schools/:schoolId')
@UseGuards(JwtAuthGuard, RolesGuard, EntitlementGuard)
export class BoardReportController {
  constructor(private readonly boardReport: BoardReportService) {}

  /** The single assemble call powering BOTH the wizard read-state and the print page. */
  @Get('periods/:periodId/board-report')
  @Roles('owner', 'accountant', 'viewer')
  assemble(
    @Param('schoolId') schoolId: string,
    @Param('periodId') periodId: string,
    @Query('granularity') granularity?: string,
    @Query('month') month?: string,
    @Query('quarter') quarter?: string,
  ) {
    return this.boardReport.assemble(schoolId, periodId, granularity ?? 'annual', month, quarter)
  }

  /** Persist editable state (title/committee/explanations/MD&A/markGenerated). */
  @Put('periods/:periodId/board-report')
  @Roles('owner', 'accountant')
  save(
    @Param('schoolId') schoolId: string,
    @Param('periodId') periodId: string,
    @Body() dto: SaveBoardReportDto,
    @CurrentUser() user: User,
  ) {
    return this.boardReport.save(schoolId, periodId, dto, user.id)
  }

  /** Generate an MD&A narrative (rule baseline + optional LLM). Does NOT persist. */
  @Post('periods/:periodId/board-report/mda')
  @Roles('owner', 'accountant')
  mda(
    @Param('schoolId') schoolId: string,
    @Param('periodId') periodId: string,
    @Body() dto: MdaBoardReportDto,
  ) {
    return this.boardReport.generateMda(schoolId, periodId, dto)
  }
}
