import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module.js'
import { BillingModule } from '../billing/billing.module.js'
import { AuditModule } from '../common/audit/audit.module.js'
import { CampaignController } from './campaign.controller.js'
import { AdvancementService } from './advancement.service.js'

/**
 * Phase 4 Advancement v1 — the fundraising campaign register module. The FOURTH
 * licensable module (after governance + accreditation + facilities), gated by the
 * 'advancement' entitlement — the LAST uncovered domain, completing all 8 briefing
 * sources.
 *
 * DEP DIRECTION (critical — no circular dep): this module imports ONLY AuthModule
 * (guards), BillingModule (the reused EntitlementGuard + BillingService), and
 * AuditModule. It does NOT import AnalyticsModule. AnalyticsModule imports THIS
 * module to inject the exported AdvancementService into BriefingService, so the only
 * edge is analytics → advancement (acyclic). PrismaService is global.
 */
@Module({
  imports: [AuthModule, BillingModule, AuditModule],
  controllers: [CampaignController],
  providers: [AdvancementService],
  exports: [AdvancementService],
})
export class AdvancementModule {}
