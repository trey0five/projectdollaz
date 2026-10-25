import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module.js'
import { AuditModule } from '../common/audit/audit.module.js'
import { PeriodsModule } from '../periods/periods.module.js'
import { BillingModule } from '../billing/billing.module.js'
import { StatementsModule } from '../statements/statements.module.js'
import { MappingModule } from '../mapping/mapping.module.js'
import { FinanceFilesModule } from '../finance-files/finance-files.module.js'
import { ImportsController } from './imports.controller.js'
import { ImportsService } from './imports.service.js'

/**
 * Immutable, append-only imports. Reuses PeriodsService (create-or-get) and the
 * shared AuditService. ImportsService is exported for the Statements module's
 * comparative resolver (it reads active imports across periods).
 *
 * StatementsModule is imported so DELETE can re-run the canonical generate to
 * reconcile the period snapshot after a trial balance is removed (no circular
 * dep — StatementsModule does not import ImportsModule).
 *
 * MappingModule is imported so a saved QuickBooks statement export can merge
 * its section-backed account categories (A1, ImportsService.create). No cycle:
 * MappingModule imports only Auth + Statements, neither imports ImportsModule.
 *
 * FinanceFilesModule supplies FinanceRemovalsService so DELETE (and KYRO's undo)
 * move the removed stack into "Recently removed" instead of erasing it. No
 * cycle: FinanceFilesModule does not import ImportsModule.
 */
@Module({
  imports: [AuthModule, AuditModule, PeriodsModule, BillingModule, StatementsModule, MappingModule, FinanceFilesModule],
  controllers: [ImportsController],
  providers: [ImportsService],
  exports: [ImportsService],
})
export class ImportsModule {}
