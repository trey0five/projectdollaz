import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common'
import { SkipThrottle } from '@nestjs/throttler'
import type { User } from '@finrep/db'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js'
import { CurrentUser } from '../common/decorators/current-user.decorator.js'
import { InboxService } from './inbox.service.js'

/**
 * Per-user inbox. Every route is authed (JwtAuthGuard) and scoped to the JWT user;
 * the service filters every query by req.user.id so cross-user read/mark is
 * impossible. @SkipThrottle mirrors the read-heavy admin console (polled unread).
 */
@Controller('inbox')
@UseGuards(JwtAuthGuard)
@SkipThrottle()
export class InboxController {
  constructor(private readonly inbox: InboxService) {}

  @Get()
  list(@CurrentUser() user: User) {
    return this.inbox.list(user.id)
  }

  @Get('unread-count')
  unreadCount(@CurrentUser() user: User) {
    return this.inbox.unreadCount(user.id)
  }

  @Post(':id/read')
  @HttpCode(200)
  markRead(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.inbox.markRead(user.id, id)
  }

  @Post('read-all')
  @HttpCode(200)
  markAllRead(@CurrentUser() user: User) {
    return this.inbox.markAllRead(user.id)
  }
}
