import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { AuthModule } from '../auth/auth.module.js'
import { AdminController } from './admin.controller.js'
import { AdminService } from './admin.service.js'
import { AdminGuard } from '../common/guards/admin.guard.js'

/**
 * Platform-admin console. PrismaModule is global. AuthModule provides JwtAuthGuard;
 * ConfigModule provides the ADMIN_EMAILS allowlist AdminGuard reads. The AdminGuard
 * is the SOLE gate on these cross-tenant reads.
 */
@Module({
  imports: [ConfigModule, AuthModule],
  controllers: [AdminController],
  providers: [AdminService, AdminGuard],
})
export class AdminModule {}
