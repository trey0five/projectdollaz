import { IsNotEmpty, IsString, MaxLength } from 'class-validator'

/**
 * Body for POST /support (any authed user, rate-limited). No client sender field
 * (from/email/replyTo) — the server derives Reply-To + name from the JWT user, so
 * forbidNonWhitelisted rejects any smuggled sender field.
 */
export class SupportRequestDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  subject!: string

  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  message!: string
}
