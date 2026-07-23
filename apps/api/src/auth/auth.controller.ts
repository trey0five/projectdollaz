import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Ip,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common'
import { Throttle, SkipThrottle, ThrottlerGuard } from '@nestjs/throttler'
import type { User } from '@finrep/db'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js'

// Per-minute (ms) rate limits — brute-force speed bump on the public auth routes
// (defense-in-depth behind the edge AWS WAF rate rule). Authed routes are skipped
// so a shared-NAT office isn't throttled on normal use.
const perMin = (limit: number) => ({ default: { limit, ttl: 60_000 } })
import { CurrentUser } from '../common/decorators/current-user.decorator.js'
import { CurrentSession } from '../common/decorators/current-session.decorator.js'
import { AuthService } from './auth.service.js'
import { MfaService } from './mfa.service.js'
import { RegisterDto } from './dto/register.dto.js'
import { LoginDto } from './dto/login.dto.js'
import { AdminLoginDto } from './dto/admin-login.dto.js'
import { VerifyEmailDto } from './dto/verify-email.dto.js'
import { ResendVerificationDto } from './dto/resend-verification.dto.js'
import { ForgotPasswordDto } from './dto/forgot-password.dto.js'
import { ResetPasswordDto } from './dto/reset-password.dto.js'
import { RefreshDto } from './dto/refresh.dto.js'
import { UpdateProfileDto } from './dto/update-profile.dto.js'
import { ChangePasswordDto } from './dto/change-password.dto.js'
import { DeleteAccountDto } from './dto/delete-account.dto.js'
import { MfaLoginDto } from './dto/mfa-login.dto.js'
import { MfaSetupDto } from './dto/mfa-setup.dto.js'
import { MfaEnableDto } from './dto/mfa-enable.dto.js'
import { MfaDisableDto } from './dto/mfa-disable.dto.js'
import { MfaRegenerateBackupCodesDto } from './dto/mfa-regenerate-backup-codes.dto.js'

@Controller('auth')
@UseGuards(ThrottlerGuard)
@Throttle(perMin(20))
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly mfa: MfaService,
  ) {}

  @Post('register')
  @Throttle(perMin(5))
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto)
  }

  @Post('verify-email')
  @HttpCode(200)
  verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.auth.verifyEmail(dto.token)
  }

  @Post('resend-verification')
  @HttpCode(200)
  @Throttle(perMin(3))
  resendVerification(@Body() dto: ResendVerificationDto) {
    return this.auth.resendVerification(dto.email)
  }

  @Post('login')
  @HttpCode(200)
  @Throttle(perMin(10))
  login(@Body() dto: LoginDto, @Ip() ip: string) {
    // Resolve the real client IP for best-effort geolocation. `trust proxy` is set
    // to the exact hop count, so @Ip() already yields the true client IP by walking
    // back the proxy chain. We must NOT prefer the raw first X-Forwarded-For hop /
    // X-Real-IP: those are client-supplied and spoofable, letting an authed user
    // falsify their city/state on the admin geo map. IP is read HERE (not the body)
    // — the LoginDto is forbidNonWhitelisted and rejects extra fields.
    return this.auth.login(dto, ip)
  }

  // Hidden super-admin console login. Username-based (NOT email), reached from the
  // easter-egg entry on the public landing page. Throttled harder than user login;
  // reuses the full login core (lockout + token issuance + geo capture) but only
  // for usernames in the ADMIN_EMAILS allowlist — anyone else gets a generic 401.
  @Post('admin-login')
  @HttpCode(200)
  @Throttle(perMin(6))
  adminLogin(@Body() dto: AdminLoginDto, @Ip() ip: string) {
    return this.auth.adminLogin(dto.username, dto.password, ip)
  }

  // Second login step: challenge token + TOTP/backup code → normal token pair.
  // Path is /auth/login/mfa (NOT /auth/mfa/verify) so the web client's
  // isAuthEndpoint() ('/auth/login' substring) auto-excludes it from the
  // Bearer-attach and 401-retry interceptors.
  @Post('login/mfa')
  @HttpCode(200)
  @Throttle(perMin(10))
  loginMfa(@Body() dto: MfaLoginDto) {
    return this.mfa.verifyChallenge(dto)
  }

  @Post('refresh')
  @HttpCode(200)
  @Throttle(perMin(60))
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refresh_token)
  }

  @Post('logout')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @SkipThrottle()
  logout(@CurrentUser() user: User) {
    return this.auth.logout(user.id)
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @SkipThrottle()
  me(@CurrentUser() user: User) {
    return this.auth.me(user)
  }

  @Patch('me')
  @UseGuards(JwtAuthGuard)
  @SkipThrottle()
  updateMe(@CurrentUser() user: User, @Body() dto: UpdateProfileDto) {
    return this.auth.updateProfile(user, dto)
  }

  // Data-subject erasure: delete your own account (password-confirmed).
  @Delete('me')
  @UseGuards(JwtAuthGuard)
  @SkipThrottle()
  deleteMe(@CurrentUser() user: User, @Body() dto: DeleteAccountDto) {
    return this.auth.deleteAccount(user, dto.password)
  }

  @Post('change-password')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @SkipThrottle()
  changePassword(
    @CurrentUser() user: User,
    @CurrentSession() sid: string | undefined,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.auth.changePassword(user, sid, dto)
  }

  // ── TOTP MFA management ────────────────────────────────────────────────────
  // DELIBERATE deviation from the authed-routes-@SkipThrottle() norm: setup/
  // enable/disable/regenerate all accept a guessable 6-digit code (or trigger
  // password checks), so they keep a 10/min throttle even behind JwtAuthGuard.
  // Only the read-only status route skips throttling.

  @Post('mfa/setup')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @Throttle(perMin(10))
  mfaSetup(@CurrentUser() user: User, @Body() dto: MfaSetupDto) {
    return this.mfa.setup(user, dto)
  }

  @Post('mfa/enable')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @Throttle(perMin(10))
  mfaEnable(
    @CurrentUser() user: User,
    @CurrentSession() sid: string | undefined,
    @Body() dto: MfaEnableDto,
  ) {
    return this.mfa.enable(user, sid, dto)
  }

  @Post('mfa/disable')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @Throttle(perMin(10))
  mfaDisable(
    @CurrentUser() user: User,
    @CurrentSession() sid: string | undefined,
    @Body() dto: MfaDisableDto,
  ) {
    return this.mfa.disable(user, sid, dto)
  }

  @Post('mfa/backup-codes/regenerate')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @Throttle(perMin(10))
  mfaRegenerateBackupCodes(
    @CurrentUser() user: User,
    @Body() dto: MfaRegenerateBackupCodesDto,
  ) {
    return this.mfa.regenerateBackupCodes(user, dto)
  }

  @Get('mfa/status')
  @UseGuards(JwtAuthGuard)
  @SkipThrottle()
  mfaStatus(@CurrentUser() user: User) {
    return this.mfa.status(user)
  }

  @Post('forgot-password')
  @HttpCode(200)
  @Throttle(perMin(5))
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.auth.forgotPassword(dto.email)
  }

  @Post('reset-password')
  @HttpCode(200)
  @Throttle(perMin(10))
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.auth.resetPassword(dto)
  }
}
