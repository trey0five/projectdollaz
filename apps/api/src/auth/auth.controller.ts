import { Body, Controller, Delete, Get, HttpCode, Patch, Post, UseGuards } from '@nestjs/common'
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
import { RegisterDto } from './dto/register.dto.js'
import { LoginDto } from './dto/login.dto.js'
import { VerifyEmailDto } from './dto/verify-email.dto.js'
import { ResendVerificationDto } from './dto/resend-verification.dto.js'
import { ForgotPasswordDto } from './dto/forgot-password.dto.js'
import { ResetPasswordDto } from './dto/reset-password.dto.js'
import { RefreshDto } from './dto/refresh.dto.js'
import { UpdateProfileDto } from './dto/update-profile.dto.js'
import { ChangePasswordDto } from './dto/change-password.dto.js'
import { DeleteAccountDto } from './dto/delete-account.dto.js'

@Controller('auth')
@UseGuards(ThrottlerGuard)
@Throttle(perMin(20))
export class AuthController {
  constructor(private readonly auth: AuthService) {}

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
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto)
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
