import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module.js'
import { AuditModule } from '../common/audit/audit.module.js'
import { PeriodsModule } from '../periods/periods.module.js'
import { MappingModule } from '../mapping/mapping.module.js'
import { BillingModule } from '../billing/billing.module.js'
import { StatementsController } from './statements.controller.js'
import { StatementsService } from './statements.service.js'

/**
 * Server-side canonical generate + persist. Reuses PeriodsService (tenant-checked
 * period lookup), MappingService (active mapping/chart resolution), the pure
 * @finrep/engine, and AuditService.
 */
@Module({
  imports: [AuthModule, AuditModule, PeriodsModule, MappingModule, BillingModule],
  controllers: [StatementsController],
  providers: [StatementsService],
  exports: [StatementsService],
})
export class StatementsModule {}
