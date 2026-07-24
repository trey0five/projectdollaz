import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common'
import { Throttle, ThrottlerGuard } from '@nestjs/throttler'
import type { User } from '@finrep/db'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js'
import { CurrentUser } from '../common/decorators/current-user.decorator.js'
import { MailerService } from '../auth/mailer.service.js'
import { SupportRequestDto } from './dto/support-request.dto.js'

const perMin = (limit: number) => ({ default: { limit, ttl: 60_000 } })

/**
 * In-app support form. Authed (JwtAuthGuard) + rate-limited (5/min per client).
 * The support address, Reply-To, and sender name are ALL derived server-side from
 * the JWT user — no client sender field is accepted (forbidNonWhitelisted rejects
 * one), so the email cannot be spoofed and the From stays the verified identity.
 */
@Controller('support')
@UseGuards(JwtAuthGuard, ThrottlerGuard)
export class SupportController {
  constructor(private readonly mailer: MailerService) {}

  @Post()
  @HttpCode(200)
  @Throttle(perMin(5))
  async submit(
    @CurrentUser() user: User,
    @Body() dto: SupportRequestDto,
  ): Promise<{ ok: true }> {
    const name =
      [user.firstName, user.lastName].filter(Boolean).join(' ').trim() ||
      user.email.split('@')[0]
    await this.mailer.sendSupportEmail(user.email, name, dto.subject, dto.message)
    return { ok: true }
  }
}
