import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module.js'
import { PeriodsModule } from '../periods/periods.module.js'
import { BillingModule } from '../billing/billing.module.js'
import { AuditModule } from '../common/audit/audit.module.js'
import { ComplianceController } from './compliance.controller.js'
import { ComplianceService } from './compliance.service.js'
import { ComplianceInputsController } from './compliance-inputs.controller.js'
import { ComplianceInputsService } from './compliance-inputs.service.js'
import { ReconciliationController } from './reconciliation.controller.js'
import { DisbursementsService } from './disbursements.service.js'
import { ReconciliationService } from './reconciliation.service.js'
import { CorrectiveActionController } from './corrective-action.controller.js'
import { CorrectiveActionService } from './corrective-action.service.js'
import { ChecklistController } from './checklist.controller.js'
import { ChecklistService } from './checklist.service.js'
import { WorkpapersController } from './workpapers.controller.js'
import { WorkpapersService } from './workpapers.service.js'

/**
 * Phase 2A — Florida scholarship AUP Review Readiness. Reads existing
 * statement_snapshots + period_operational_data + the new period_compliance_inputs
 * and runs the pure @finrep/compliance package. AuthModule supplies guards;
 * BillingModule supplies the reused EntitlementGuard; PeriodsModule supplies
 * tenant-checked period lookups. Mirrors AnalyticsModule's wiring.
 */
@Module({
  imports: [AuthModule, PeriodsModule, BillingModule, AuditModule],
  controllers: [
    ComplianceController,
    ComplianceInputsController,
    ReconciliationController,
    CorrectiveActionController,
    ChecklistController,
    WorkpapersController,
  ],
  providers: [
    ComplianceService,
    ComplianceInputsService,
    DisbursementsService,
    ReconciliationService,
    CorrectiveActionService,
    ChecklistService,
    WorkpapersService,
  ],
})
export class ComplianceModule {}
