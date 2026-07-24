import { Module } from '@nestjs/common'
import { ThrottlerModule } from '@nestjs/throttler'
import { AuthModule } from '../auth/auth.module.js'
import { SupportController } from './support.controller.js'

/**
 * In-app support form. AuthModule provides JwtAuthGuard + MailerService (the send
 * path). ThrottlerModule.forRoot is re-registered here so ThrottlerGuard resolves
 * its DI locally (the default bucket; the handler @Throttle(perMin(5)) overrides).
 */
@Module({
  imports: [AuthModule, ThrottlerModule.forRoot([{ ttl: 60_000, limit: 20 }])],
  controllers: [SupportController],
})
export class SupportModule {}
