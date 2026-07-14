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
import { AdvancementService } from './advancement.service.js'
import { CreateCampaignDto } from './dto/create-campaign.dto.js'
import { UpdateCampaignDto } from './dto/update-campaign.dto.js'

/**
 * Phase 4 Advancement v1 — the fundraising campaign register controller. The FOURTH
 * use of the per-module entitlement backbone (after governance + accreditation +
 * facilities): the class-level @RequiresModule('advancement') makes the shared
 * EntitlementGuard emit a 402 { code:'MODULE_NOT_LICENSED', module:'advancement' }
 * for an entitled-but-unlicensed school (trialing resolves like active: NULL → finance-only).
 * Guard ORDER matches the app: JwtAuthGuard (401) → RolesGuard (403) →
 * EntitlementGuard (402). The class-level decorator covers EVERY route (incl. GET),
 * so read access is 402-gated uniformly.
 *
 * All roles may READ; owner/accountant may WRITE. Tenant isolation lives in the
 * service (every query filtered by schoolId). ParseUUIDPipe → bad UUID 400.
 */
@Controller('schools/:schoolId/advancement/campaigns')
@UseGuards(JwtAuthGuard, RolesGuard, EntitlementGuard)
@RequiresModule('advancement')
export class CampaignController {
  constructor(private readonly advancement: AdvancementService) {}

  @Get()
  @Roles('owner', 'accountant', 'viewer')
  list(@Param('schoolId', ParseUUIDPipe) schoolId: string) {
    return this.advancement.listCampaigns(schoolId)
  }

  @Post()
  @Roles('owner', 'accountant')
  create(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Body() dto: CreateCampaignDto,
    @CurrentUser() user: User,
  ) {
    return this.advancement.createCampaign(schoolId, dto, user.id)
  }

  @Patch(':campaignId')
  @Roles('owner', 'accountant')
  update(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Param('campaignId', ParseUUIDPipe) campaignId: string,
    @Body() dto: UpdateCampaignDto,
    @CurrentUser() user: User,
  ) {
    return this.advancement.updateCampaign(schoolId, campaignId, dto, user.id)
  }

  @Delete(':campaignId')
  @Roles('owner', 'accountant')
  remove(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Param('campaignId', ParseUUIDPipe) campaignId: string,
    @CurrentUser() user: User,
  ) {
    return this.advancement.removeCampaign(schoolId, campaignId, user.id)
  }
}
