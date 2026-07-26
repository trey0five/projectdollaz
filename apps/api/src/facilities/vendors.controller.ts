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
import { CreateVendorDto, UpdateVendorDto } from './dto/vendor.dto.js'

/**
 * Facilities vendors — the school contractor register. Same guard chain as the
 * maintenance register (Jwt 401 → Roles 403 → Entitlement 402, class-level
 * @RequiresModule('facilities') covers every route). All roles READ (the web
 * filters `active`); owner/accountant WRITE. Tenant isolation lives in the
 * service (every query schoolId-scoped). DELETE 400s while the vendor is
 * referenced by any bid/item — deactivate instead.
 */
@Controller('schools/:schoolId/facilities/vendors')
@UseGuards(JwtAuthGuard, RolesGuard, EntitlementGuard)
@RequiresModule('facilities')
export class VendorsController {
  constructor(private readonly facilities: FacilitiesService) {}

  @Get()
  @Roles('owner', 'accountant', 'viewer')
  list(@Param('schoolId', ParseUUIDPipe) schoolId: string) {
    return this.facilities.listVendors(schoolId)
  }

  @Post()
  @Roles('owner', 'accountant')
  create(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Body() dto: CreateVendorDto,
    @CurrentUser() user: User,
  ) {
    return this.facilities.createVendor(schoolId, dto, user.id)
  }

  @Patch(':vendorId')
  @Roles('owner', 'accountant')
  update(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Param('vendorId', ParseUUIDPipe) vendorId: string,
    @Body() dto: UpdateVendorDto,
    @CurrentUser() user: User,
  ) {
    return this.facilities.updateVendor(schoolId, vendorId, dto, user.id)
  }

  @Delete(':vendorId')
  @Roles('owner', 'accountant')
  remove(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Param('vendorId', ParseUUIDPipe) vendorId: string,
    @CurrentUser() user: User,
  ) {
    return this.facilities.removeVendor(schoolId, vendorId, user.id)
  }
}
