import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module.js'
import { BillingModule } from '../billing/billing.module.js'
import { AuditModule } from '../common/audit/audit.module.js'
import { PoliciesController } from './policies.controller.js'
import { PoliciesService } from './policies.service.js'

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
  controllers: [PoliciesController],
  providers: [PoliciesService],
  exports: [PoliciesService],
})
export class GovernanceModule {}
