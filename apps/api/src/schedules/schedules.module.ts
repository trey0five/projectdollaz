import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module.js'
import { PeriodsModule } from '../periods/periods.module.js'
import { BillingModule } from '../billing/billing.module.js'
import { AuditModule } from '../common/audit/audit.module.js'
import { SchedulesController } from './schedules.controller.js'
import { SchedulesService } from './schedules.service.js'

/**
 * Phase 3 — supporting schedules (Capital Budget + Cash & Investments). AuthModule
 * supplies the guards, BillingModule the reused EntitlementGuard, PeriodsModule the
 * tenant-checked lookups, AuditModule the saved audit. No AnalyticsModule — these
 * schedules are user-entered and never touch trial balances. PrismaService is global.
 *
 * SchedulesService is EXPORTED so BoardReportModule can inject it to reshape the
 * stored rows into the capitalBudget/cashInvestments board-report sections
 * (one-directional: Schedules imports nothing from board-report → acyclic).
 */
@Module({
  imports: [AuthModule, PeriodsModule, BillingModule, AuditModule],
  controllers: [SchedulesController],
  providers: [SchedulesService],
  exports: [SchedulesService],
})
export class SchedulesModule {}
