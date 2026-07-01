import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module.js'
import { BillingModule } from '../billing/billing.module.js'
import { AuditModule } from '../common/audit/audit.module.js'
import { TasksController } from './tasks.controller.js'
import { TasksService } from './tasks.service.js'

/**
 * Phase 3 Workflow v1 — the generic TASK engine module. The resource is 'tasks';
 * the module is named 'workflow' to match the roadmap capability. Workflow is CORE
 * (always included) — contrast GovernanceModule, a licensed module.
 *
 * DEP DIRECTION (critical — no circular dep): this module imports ONLY AuthModule
 * (guards), BillingModule (the reused EntitlementGuard), and AuditModule. It does
 * NOT import AnalyticsModule. AnalyticsModule imports THIS module to inject the
 * exported TasksService into BriefingService (the 'workflow' STEP), so the only
 * edge is analytics → workflow (acyclic, identical to analytics → governance).
 * PrismaService is global.
 */
@Module({
  imports: [AuthModule, BillingModule, AuditModule],
  controllers: [TasksController],
  providers: [TasksService],
  exports: [TasksService],
})
export class WorkflowModule {}
