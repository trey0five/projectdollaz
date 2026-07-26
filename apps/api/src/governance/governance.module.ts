import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module.js'
import { BillingModule } from '../billing/billing.module.js'
import { AuditModule } from '../common/audit/audit.module.js'
import { KnowledgeModule } from '../knowledge/knowledge.module.js'
import { PoliciesController } from './policies.controller.js'
import { PoliciesService } from './policies.service.js'
import { CommitteesController } from './committees.controller.js'
import { CommitteesService } from './committees.service.js'
import { MeetingsController } from './meetings.controller.js'
import { MeetingsService } from './meetings.service.js'
import { PeopleController } from './people.controller.js'
import { PeopleService } from './people.service.js'
import { GovernanceReportController } from './governance-report.controller.js'
import { GovernanceReportService } from './governance-report.service.js'

/**
 * Phase 3 Governance v1 — the Policy Register module. The first NON-FINANCE domain
 * beyond enrollment, gated by the 'governance' entitlement module.
 *
 * DEP DIRECTION (critical — no circular dep): this module imports ONLY
 * AuthModule (guards), BillingModule (the reused EntitlementGuard + BillingService),
 * AuditModule, and KnowledgeModule (Phase 2 — PeopleService lists a person's
 * credential documents via the exported DocumentsService; KnowledgeModule imports
 * none of this module, so the edge is acyclic). It does NOT import AnalyticsModule.
 * AnalyticsModule imports THIS module to inject the exported PoliciesService into
 * BriefingService, so the only edge is analytics → governance (acyclic).
 * PrismaService is global.
 */
@Module({
  imports: [AuthModule, BillingModule, AuditModule, KnowledgeModule],
  controllers: [
    PoliciesController,
    CommitteesController,
    MeetingsController,
    PeopleController,
    GovernanceReportController,
  ],
  providers: [PoliciesService, CommitteesService, MeetingsService, PeopleService, GovernanceReportService],
  // MeetingsService is EXPORTED so AnalyticsModule's BriefingService can inject it
  // for the governance STEP's meeting items (the analytics → governance edge already
  // exists for PoliciesService — no new circular dep). GovernanceReportService is
  // EXPORTED for Penny's read-only get_governance_status tool (AssistantModule).
  exports: [PoliciesService, CommitteesService, MeetingsService, PeopleService, GovernanceReportService],
})
export class GovernanceModule {}
