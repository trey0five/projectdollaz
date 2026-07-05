import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common'
import type { User } from '@finrep/db'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js'
import { CurrentUser } from '../common/decorators/current-user.decorator.js'
import { OrgQboCompanyService } from './qbo-company.service.js'
import { OrgQbCallbackDto, OrgQbCompanyImportDto, OrgQbMappingDto } from './dto/qbo.dto.js'

/**
 * Diocesan QuickBooks (Topology B): ONE QuickBooks company connected at the
 * ORGANIZATION level, split into per-school data by Location/Class mapping.
 * JwtAuthGuard ONLY, like QboOrgController — RolesGuard/EntitlementGuard can't
 * resolve a schoolId on an org route, so org isolation, the manager gate and
 * per-school role/entitlement checks all live in OrgQboCompanyService.
 */
@Controller('organizations/:orgId/integrations/qb/company')
@UseGuards(JwtAuthGuard)
export class QboCompanyController {
  constructor(private readonly company: OrgQboCompanyService) {}

  /** DB-only connection status (any org member). */
  @Get()
  status(@CurrentUser() user: User, @Param('orgId') orgId: string) {
    return this.company.status(user, orgId)
  }

  /** The Intuit consent URL; state carries `org:<orgId>` (manager). */
  @Get('connect')
  connect(@CurrentUser() user: User, @Param('orgId') orgId: string) {
    return this.company.connectUrl(user, orgId)
  }

  /** OAuth callback: code + realmId from Intuit; folds same-realm school connections. */
  @Post('callback')
  callback(
    @CurrentUser() user: User,
    @Param('orgId') orgId: string,
    @Body() dto: OrgQbCallbackDto,
  ) {
    return this.company.callback(user, orgId, dto.code, dto.realmId)
  }

  /** Disconnect. `?removeData=true` also purges what this connection imported. */
  @Delete()
  disconnect(
    @CurrentUser() user: User,
    @Param('orgId') orgId: string,
    @Query('removeData') removeData: string,
  ) {
    return this.company.disconnect(user, orgId, removeData === 'true')
  }

  /** Live mapping view: QBO values + stored decisions + org schools (any org member). */
  @Get('mapping')
  mapping(@CurrentUser() user: User, @Param('orgId') orgId: string) {
    return this.company.mappingView(user, orgId)
  }

  /** Save the decisions for one dimension (full replace) and make it active. */
  @Put('mapping')
  saveMapping(
    @CurrentUser() user: User,
    @Param('orgId') orgId: string,
    @Body() dto: OrgQbMappingDto,
  ) {
    return this.company.saveMapping(user, orgId, dto)
  }

  /** Import every mapped school (or dto.schoolIds subset) from the one company. */
  @Post('import')
  import(
    @CurrentUser() user: User,
    @Param('orgId') orgId: string,
    @Body() dto: OrgQbCompanyImportDto,
  ) {
    return this.company.import(user, orgId, dto)
  }
}
