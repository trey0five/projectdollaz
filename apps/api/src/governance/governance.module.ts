import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module.js'
import { BillingModule } from '../billing/billing.module.js'
import { AuditModule } from '../common/audit/audit.module.js'
import { PoliciesController } from './policies.controller.js'
import { PoliciesService } from './policies.service.js'
import { CommitteesController } from './committees.controller.js'
import { CommitteesService } from './committees.service.js'
import { MeetingsController } from './meetings.controller.js'
import { MeetingsService } from './meetings.service.js'

/**
 * Phase 3 Governance v1 — the Policy Register module. The first NON-FINANCE domain
 * beyond enrollment, gated by the 'governance' entitlement module.
 *
 * DEP DIRECTION (critical — no circular dep): this module imports ONLY
 * AuthModule (guards), BillingModule (the reused EntitlementGuard + BillingService),
 * and AuditModule. It does NOT import AnalyticsModule. AnalyticsModule imports THIS
 * module to inject the exported PoliciesService into BriefingService, so the only
 * edge is analytics → governance (acyclic). PrismaService is global.
 */
@Module({
  imports: [AuthModule, BillingModule, AuditModule],
  controllers: [PoliciesController, CommitteesController, MeetingsController],
  providers: [PoliciesService, CommitteesService, MeetingsService],
  // MeetingsService is EXPORTED so AnalyticsModule's BriefingService can inject it
  // for the governance STEP's meeting items (the analytics → governance edge already
  // exists for PoliciesService — no new circular dep).
  exports: [PoliciesService, CommitteesService, MeetingsService],
})
export class GovernanceModule {}
