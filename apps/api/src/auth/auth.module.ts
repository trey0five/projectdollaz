import { Module } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { ThrottlerModule } from '@nestjs/throttler'
import { PrismaModule } from '../prisma/prisma.module.js'
import { AuditModule } from '../common/audit/audit.module.js'
import { AuthController } from './auth.controller.js'
import { AuthService } from './auth.service.js'
import { MfaService } from './mfa.service.js'
import { PasswordService } from './password.service.js'
import { TokenService } from './token.service.js'
import { MailerService } from './mailer.service.js'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js'
import { RolesGuard } from '../common/guards/roles.guard.js'

@Module({
  imports: [
    PrismaModule,
    AuditModule,
    // Default bucket; per-route @Throttle() overrides on the controller.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 20 }]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        // configuration.ts guarantees a resolved, non-default secret (and fails
        // fast in production). No literal fallback here — never sign with a
        // well-known constant.
        const secret = config.get<string>('jwt.secret')
        if (!secret) {
          throw new Error('jwt.secret is not configured')
        }
        return { secret }
      },
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    MfaService,
    PasswordService,
    TokenService,
    MailerService,
    JwtAuthGuard,
    RolesGuard,
  ],
  exports: [PasswordService, TokenService, MailerService, JwtAuthGuard, RolesGuard, JwtModule],
})
export class AuthModule {}
