import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module.js'
import { AuditModule } from '../common/audit/audit.module.js'
import { PeriodsModule } from '../periods/periods.module.js'
import { BillingModule } from '../billing/billing.module.js'
import { ImportsController } from './imports.controller.js'
import { ImportsService } from './imports.service.js'

/**
 * Immutable, append-only imports. Reuses PeriodsService (create-or-get) and the
 * shared AuditService. ImportsService is exported for the Statements module's
 * comparative resolver (it reads active imports across periods).
 */
@Module({
  imports: [AuthModule, AuditModule, PeriodsModule, BillingModule],
  controllers: [ImportsController],
  providers: [ImportsService],
  exports: [ImportsService],
})
export class ImportsModule {}
