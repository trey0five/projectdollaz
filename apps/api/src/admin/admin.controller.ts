import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common'
import { SkipThrottle } from '@nestjs/throttler'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js'
import { AdminGuard } from '../common/guards/admin.guard.js'
import { SuperadminGuard } from '../common/guards/superadmin.guard.js'
import { CurrentUser } from '../common/decorators/current-user.decorator.js'
import type { User } from '@finrep/db'
import { AdminService } from './admin.service.js'
import { AdminUsersQueryDto } from './dto/admin-users-query.dto.js'
import { CreateAdminDto } from './dto/create-admin.dto.js'
import { SendMessageDto } from './dto/send-message.dto.js'

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

  // ── Admin management — SUPER-ADMIN ONLY ────────────────────────────────────────
  // Method-level @UseGuards ADD to the class-level (JwtAuthGuard, AdminGuard); the
  // SuperadminGuard is the binding constraint that stops a regular DB admin here.

  @Get('admins')
  @UseGuards(JwtAuthGuard, SuperadminGuard)
  listAdmins() {
    return this.admin.listAdmins()
  }

  @Post('admins')
  @UseGuards(JwtAuthGuard, SuperadminGuard)
  createAdmin(@Body() dto: CreateAdminDto) {
    return this.admin.createOrPromoteAdmin(dto)
  }

  @Post('users/:id/revoke-admin')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, SuperadminGuard)
  revokeAdmin(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.admin.revokeAdmin(user, id)
  }

  // ── Inbox compose — ADMIN-gated (inherits class-level AdminGuard) ──────────────
  @Post('messages')
  @HttpCode(200)
  sendMessages(@Body() dto: SendMessageDto) {
    return this.admin.sendMessages(dto)
  }
}
