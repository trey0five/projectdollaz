import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { AuthModule } from '../auth/auth.module.js'
import { AuditModule } from '../common/audit/audit.module.js'
import { AdminController } from './admin.controller.js'
import { AdminService } from './admin.service.js'
import { AdminGuard } from '../common/guards/admin.guard.js'
import { SuperadminGuard } from '../common/guards/superadmin.guard.js'

/**
 * Platform-admin console + admin management. PrismaModule is global. AuthModule
 * provides JwtAuthGuard + PasswordService; ConfigModule provides the ADMIN_EMAILS
 * allowlist the guards read; AuditModule provides AuditService (not global) for the
 * admin-management audit trail. AdminGuard gates the console; SuperadminGuard gates
 * the narrower admin-management routes.
 */
@Module({
  imports: [ConfigModule, AuthModule, AuditModule],
  controllers: [AdminController],
  providers: [AdminService, AdminGuard, SuperadminGuard],
})
export class AdminModule {}
