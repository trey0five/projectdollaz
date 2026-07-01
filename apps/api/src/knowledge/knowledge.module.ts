import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module.js'
import { BillingModule } from '../billing/billing.module.js'
import { SearchController } from './search.controller.js'
import { SearchService } from './search.service.js'

/**
 * Phase 4 Knowledge/Search v1 — platform-wide search (CORE, not a licensed module).
 *
 * DEP DIRECTION (critical — no circular dep): imports ONLY AuthModule (the guards)
 * and BillingModule (the reused EntitlementGuard + BillingService for the per-domain
 * gate). PrismaService is global. It does NOT import GovernanceModule /
 * AccreditationModule / FacilitiesModule / WorkflowModule — SearchService reads
 * every domain PRISMA-DIRECT, so there is no cycle.
 */
@Module({
  imports: [AuthModule, BillingModule],
  controllers: [SearchController],
  providers: [SearchService],
})
export class KnowledgeModule {}
