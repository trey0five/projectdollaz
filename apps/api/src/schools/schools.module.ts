import { Module } from '@nestjs/common'
import { PrismaModule } from '../prisma/prisma.module.js'
import { AuthModule } from '../auth/auth.module.js'
import { AuditModule } from '../common/audit/audit.module.js'
import { BillingModule } from '../billing/billing.module.js'
import { SchoolsController } from './schools.controller.js'
import { SchoolsService } from './schools.service.js'

@Module({
  imports: [PrismaModule, AuthModule, AuditModule, BillingModule],
  controllers: [SchoolsController],
  providers: [SchoolsService],
})
export class SchoolsModule {}
