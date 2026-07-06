import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common'
import type { User } from '@finrep/db'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js'
import { CurrentUser } from '../common/decorators/current-user.decorator.js'
import { BriefingNarrationService } from './briefing-narration.service.js'
import { NarrateOrgBriefingDto } from './dto/narrate-briefing.dto.js'

/**
 * Organization-wide narrated briefing. JwtAuthGuard ONLY — mirrors
 * OrgBriefingController exactly (RolesGuard can't resolve a schoolId for an org
 * route, and EntitlementGuard would 402 with no school context). Org isolation +
 * the lens ceiling are enforced INSIDE getOrgBriefing via the caller's active
 * memberships (no cross-org leakage). POST (not GET) because the call may trigger
 * an LLM generation.
 */
@Controller('organizations/:orgId')
@UseGuards(JwtAuthGuard)
export class OrgNarrationController {
  constructor(private readonly narration: BriefingNarrationService) {}

  @Post('briefing-narration')
  narrate(
    @CurrentUser() user: User,
    @Param('orgId') orgId: string,
    @Body() dto: NarrateOrgBriefingDto,
  ) {
    return this.narration.narrateOrg(user, orgId, dto)
  }
}
