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
import { PoliciesService } from './policies.service.js'
import { CreatePolicyDto } from './dto/create-policy.dto.js'
import { UpdatePolicyDto } from './dto/update-policy.dto.js'

/**
 * Phase 3 Governance v1 — the POLICY REGISTER controller. FIRST real end-to-end
 * use of the per-module entitlement backbone: the class-level @RequiresModule
 * ('governance') makes the shared EntitlementGuard emit a 402 { code:
 * 'MODULE_NOT_LICENSED', module:'governance' } for an entitled-but-unlicensed
 * school (a trial school gets all-access → passes). Guard ORDER matches the rest
 * of the app: JwtAuthGuard (401) → RolesGuard (403) → EntitlementGuard (402).
 *
 * All roles may READ; owner/accountant may WRITE. Tenant isolation lives in the
 * service (every query filtered by schoolId). ParseUUIDPipe → bad UUID 400.
 */
@Controller('schools/:schoolId/policies')
@UseGuards(JwtAuthGuard, RolesGuard, EntitlementGuard)
@RequiresModule('governance')
export class PoliciesController {
  constructor(private readonly policies: PoliciesService) {}

  @Get()
  @Roles('owner', 'accountant', 'viewer')
  list(@Param('schoolId', ParseUUIDPipe) schoolId: string) {
    return this.policies.list(schoolId)
  }

  @Post()
  @Roles('owner', 'accountant')
  create(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Body() dto: CreatePolicyDto,
    @CurrentUser() user: User,
  ) {
    return this.policies.create(schoolId, dto, user.id)
  }

  @Patch(':policyId')
  @Roles('owner', 'accountant')
  update(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Param('policyId', ParseUUIDPipe) policyId: string,
    @Body() dto: UpdatePolicyDto,
    @CurrentUser() user: User,
  ) {
    return this.policies.update(schoolId, policyId, dto, user.id)
  }

  @Delete(':policyId')
  @Roles('owner', 'accountant')
  remove(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Param('policyId', ParseUUIDPipe) policyId: string,
    @CurrentUser() user: User,
  ) {
    return this.policies.remove(schoolId, policyId, user.id)
  }
}
