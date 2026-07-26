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
import { AcceptBidDto, CreateBidDto, UpdateBidDto } from './dto/bid.dto.js'

/**
 * Facilities bids — competing vendor quotes on one maintenance item, nested under
 * the item route. Same guard chain as the register. ROLES CLARITY (the frozen
 * contract): all roles READ; owner/accountant manage pending bids; accept/reopen
 * are **@Roles('owner') ONLY** — "Leadership approves winners". An accountant
 * calling accept/reopen gets a clean 403 from RolesGuard, server-enforced.
 * Decided (accepted/rejected) bids are an immutable record (PATCH/DELETE 400 in
 * the service). Bids are LAZY-loaded by the web (GET on panel open — D6).
 */
@Controller('schools/:schoolId/facilities/maintenance/:itemId/bids')
@UseGuards(JwtAuthGuard, RolesGuard, EntitlementGuard)
@RequiresModule('facilities')
export class BidsController {
  constructor(private readonly facilities: FacilitiesService) {}

  @Get()
  @Roles('owner', 'accountant', 'viewer')
  list(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
  ) {
    return this.facilities.listBids(schoolId, itemId)
  }

  @Post()
  @Roles('owner', 'accountant')
  create(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() dto: CreateBidDto,
    @CurrentUser() user: User,
  ) {
    return this.facilities.createBid(schoolId, itemId, dto, user.id)
  }

  @Patch(':bidId')
  @Roles('owner', 'accountant')
  update(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Param('bidId', ParseUUIDPipe) bidId: string,
    @Body() dto: UpdateBidDto,
    @CurrentUser() user: User,
  ) {
    return this.facilities.updateBid(schoolId, itemId, bidId, dto, user.id)
  }

  @Delete(':bidId')
  @Roles('owner', 'accountant')
  remove(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Param('bidId', ParseUUIDPipe) bidId: string,
    @CurrentUser() user: User,
  ) {
    return this.facilities.removeBid(schoolId, itemId, bidId, user.id)
  }

  /** Leadership accept — atomic winner + sibling rejection + item stamp. OWNER ONLY. */
  @Post(':bidId/accept')
  @Roles('owner')
  accept(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Param('bidId', ParseUUIDPipe) bidId: string,
    @Body() dto: AcceptBidDto,
    @CurrentUser() user: User,
  ) {
    return this.facilities.acceptBid(schoolId, itemId, bidId, dto.note ?? null, user.id)
  }

  /** Leadership undo — all bids back to pending, decision stamp cleared. OWNER ONLY. */
  @Post(':bidId/reopen')
  @Roles('owner')
  reopen(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Param('bidId', ParseUUIDPipe) bidId: string,
    @CurrentUser() user: User,
  ) {
    return this.facilities.reopenBid(schoolId, itemId, bidId, user.id)
  }
}
