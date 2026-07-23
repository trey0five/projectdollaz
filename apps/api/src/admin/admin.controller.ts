import { Controller, Get, Query, UseGuards } from '@nestjs/common'
import { SkipThrottle } from '@nestjs/throttler'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js'
import { AdminGuard } from '../common/guards/admin.guard.js'
import { AdminService } from './admin.service.js'
import { AdminUsersQueryDto } from './dto/admin-users-query.dto.js'

/**
 * Platform-admin console. EVERY route is cross-tenant (no school scoping — that is
 * the whole point) and is gated by JwtAuthGuard THEN AdminGuard at the CLASS level,
 * so every current/future handler inherits both. There is no handler-level opt-out.
 */
@Controller('admin')
@UseGuards(JwtAuthGuard, AdminGuard)
@SkipThrottle()
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('stats')
  stats() {
    return this.admin.stats()
  }

  @Get('users')
  users(@Query() query: AdminUsersQueryDto) {
    return this.admin.users(query)
  }

  @Get('organizations')
  organizations() {
    return this.admin.organizations()
  }

  @Get('geo')
  geo() {
    return this.admin.geo()
  }
}
