import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common'
import type { User } from '@finrep/db'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js'
import { RolesGuard } from '../common/guards/roles.guard.js'
import { Roles } from '../common/decorators/roles.decorator.js'
import { CurrentUser } from '../common/decorators/current-user.decorator.js'
import { EntitlementGuard } from '../billing/entitlement.guard.js'
import { RequiresModule } from '../billing/requires-module.decorator.js'
import { FacilitiesService } from './facilities.service.js'
import { CreateMaintenanceDto } from './dto/create-maintenance.dto.js'
import { UpdateMaintenanceDto } from './dto/update-maintenance.dto.js'

/**
 * Phase 4 Facilities v1 — the deferred-maintenance register controller. The THIRD
 * real use of the per-module entitlement backbone (after governance +
 * accreditation): the class-level @RequiresModule('facilities') makes the shared
 * EntitlementGuard emit a 402 { code:'MODULE_NOT_LICENSED', module:'facilities' }
 * for an entitled-but-unlicensed school (a trial school gets all-access → passes).
 * Guard ORDER matches the app: JwtAuthGuard (401) → RolesGuard (403) →
 * EntitlementGuard (402). The class-level decorator covers EVERY route (incl. GET),
 * so read access is 402-gated uniformly.
 *
 * All roles may READ; owner/accountant may WRITE. Tenant isolation lives in the
 * service (every query filtered by schoolId). ParseUUIDPipe → bad UUID 400.
 */
@Controller('schools/:schoolId/facilities/maintenance')
@UseGuards(JwtAuthGuard, RolesGuard, EntitlementGuard)
@RequiresModule('facilities')
export class MaintenanceController {
  constructor(private readonly facilities: FacilitiesService) {}

  @Get()
  @Roles('owner', 'accountant', 'viewer')
  list(@Param('schoolId', ParseUUIDPipe) schoolId: string) {
    return this.facilities.listMaintenance(schoolId)
  }

  @Post()
  @Roles('owner', 'accountant')
  create(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Body() dto: CreateMaintenanceDto,
    @CurrentUser() user: User,
  ) {
    return this.facilities.createMaintenance(schoolId, dto, user.id)
  }

  @Patch(':itemId')
  @Roles('owner', 'accountant')
  update(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() dto: UpdateMaintenanceDto,
    @CurrentUser() user: User,
  ) {
    return this.facilities.updateMaintenance(schoolId, itemId, dto, user.id)
  }

  @Delete(':itemId')
  @Roles('owner', 'accountant')
  remove(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @CurrentUser() user: User,
  ) {
    return this.facilities.removeMaintenance(schoolId, itemId, user.id)
  }
}
