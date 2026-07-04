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
import { CreateGiftDto } from './dto/create-gift.dto.js'
import { UpdateGiftDto } from './dto/update-gift.dto.js'

/**
 * Phase 4 Advancement v1 — the GIFTS & PLEDGES routes. Gift ENTRIES are children of a
 * campaign so "raised" becomes a computed rollup (Σ receivedAmount) with pledge-vs-
 * received tracking. AGGREGATE-ONLY / NO per-donor PII (see the AdvancementGift model):
 * the DTOs carry no donor identity — amounts + a non-identifying label only.
 *
 * Same guard chain + @RequiresModule('advancement') as the campaign controller
 * (JwtAuthGuard 401 → RolesGuard 403 → EntitlementGuard 402). The service resolves the
 * parent campaign (findFirst {id, schoolId}) FIRST on list/create, and resolves the gift
 * by {id, schoolId} on patch/delete, so a foreign/cross-tenant target is a 404 — a gift
 * can never be created under, listed from, or mutated for a campaign the path school does
 * not own. All roles READ; owner/accountant WRITE (viewer read-only).
 *
 * NESTED base path (list/create under a campaign): /advancement/campaigns/:id/gifts.
 * FLAT base path (patch/delete a resolved gift): /advancement/gifts/:giftId.
 */
@Controller('schools/:schoolId/advancement')
@UseGuards(JwtAuthGuard, RolesGuard, EntitlementGuard)
@RequiresModule('advancement')
export class GiftController {
  constructor(private readonly advancement: AdvancementService) {}

  @Get('campaigns/:campaignId/gifts')
  @Roles('owner', 'accountant', 'viewer')
  list(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Param('campaignId', ParseUUIDPipe) campaignId: string,
  ) {
    return this.advancement.listGifts(schoolId, campaignId)
  }

  @Post('campaigns/:campaignId/gifts')
  @Roles('owner', 'accountant')
  create(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Param('campaignId', ParseUUIDPipe) campaignId: string,
    @Body() dto: CreateGiftDto,
    @CurrentUser() user: User,
  ) {
    return this.advancement.createGift(schoolId, campaignId, dto, user.id)
  }

  @Patch('gifts/:giftId')
  @Roles('owner', 'accountant')
  update(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Param('giftId', ParseUUIDPipe) giftId: string,
    @Body() dto: UpdateGiftDto,
    @CurrentUser() user: User,
  ) {
    return this.advancement.updateGift(schoolId, giftId, dto, user.id)
  }

  @Delete('gifts/:giftId')
  @Roles('owner', 'accountant')
  remove(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Param('giftId', ParseUUIDPipe) giftId: string,
    @CurrentUser() user: User,
  ) {
    return this.advancement.removeGift(schoolId, giftId, user.id)
  }
}
