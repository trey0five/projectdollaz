import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module.js'
import { BillingModule } from '../billing/billing.module.js'
import { AuditModule } from '../common/audit/audit.module.js'
import { StandardsController } from './standards.controller.js'
import { EvidenceController } from './evidence.controller.js'
import { EvidenceSourcesController } from './evidence-sources.controller.js'
import { AccreditationService } from './accreditation.service.js'

/**
 * Phase 4 Accreditation v1 — the Standards + Evidence register module. The first
 * Phase-4 domain and the SECOND licensable module (after governance), gated by the
 * 'accreditation' entitlement.
 *
 * DEP DIRECTION (critical — no circular dep): this module imports ONLY AuthModule
 * (guards), BillingModule (the reused EntitlementGuard + BillingService), and
 * AuditModule. It does NOT import AnalyticsModule. AnalyticsModule imports THIS
 * module to inject the exported AccreditationService into BriefingService, so the
 * only edge is analytics → accreditation (acyclic). PrismaService is global.
 */
@Module({
  imports: [AuthModule, BillingModule, AuditModule],
  controllers: [StandardsController, EvidenceController, EvidenceSourcesController],
  providers: [AccreditationService],
  exports: [AccreditationService],
})
export class AccreditationModule {}
