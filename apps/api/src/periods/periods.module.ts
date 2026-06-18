import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module.js'
import { PeriodsController } from './periods.controller.js'
import { PeriodsService } from './periods.service.js'

/**
 * Fiscal periods: create-or-get + list. AuthModule supplies TokenService for the
 * JwtAuthGuard; PrismaService is global. PeriodsService is exported so Imports /
 * Statements modules can reuse create-or-get + tenant-checked period lookups.
 */
@Module({
  imports: [AuthModule],
  controllers: [PeriodsController],
  providers: [PeriodsService],
  exports: [PeriodsService],
})
export class PeriodsModule {}
