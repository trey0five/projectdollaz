import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module.js'
import { BillingModule } from '../billing/billing.module.js'
import { AuditModule } from '../common/audit/audit.module.js'
import { MaintenanceController } from './maintenance.controller.js'
import { VendorsController } from './vendors.controller.js'
import { BidsController } from './bids.controller.js'
import { FacilitiesBudgetController } from './facilities-budget.controller.js'
import { FacilitiesService } from './facilities.service.js'
import { FacilitiesBudgetService } from './facilities-budget.service.js'

/**
 * Phase 4 Facilities v1 — the deferred-maintenance register module. The THIRD
 * licensable module (after governance + accreditation), gated by the 'facilities'
 * entitlement.
 *
 * DEP DIRECTION (critical — no circular dep): this module imports ONLY AuthModule
 * (guards), BillingModule (the reused EntitlementGuard + BillingService), and
 * AuditModule. It does NOT import AnalyticsModule. AnalyticsModule imports THIS
 * module to inject the exported FacilitiesService into BriefingService, so the only
 * edge is analytics → facilities (acyclic). PrismaService is global.
 */
@Module({
  imports: [AuthModule, BillingModule, AuditModule],
  controllers: [
    MaintenanceController,
    VendorsController,
    BidsController,
    FacilitiesBudgetController,
  ],
  providers: [FacilitiesService, FacilitiesBudgetService],
  exports: [FacilitiesService],
})
export class FacilitiesModule {}
