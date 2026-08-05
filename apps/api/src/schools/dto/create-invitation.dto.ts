import { Transform } from 'class-transformer'
import { IsBoolean, IsEmail, IsIn, IsOptional, IsString, MaxLength } from 'class-validator'
import type { MembershipRole } from '@finrep/db'

export class CreateInvitationDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail()
  email!: string

  @IsIn(['owner', 'accountant', 'viewer'])
  role!: MembershipRole

  // When true, accepting the invite grants active membership on EVERY school in
  // the inviting school's org (+ unlocks the consolidated org view). Optional;
  // defaults to false (single-school access) server-side.
  @IsOptional()
  @IsBoolean()
  orgWide?: boolean

  // The POSITION the invitee will hold ("Business Manager"), copied onto their
  // membership when they redeem. Optional — an invite without one behaves as it
  // always has, and an owner can set it later in Settings → Members.
  @IsOptional()
  @Transform(({ value }) => {
    if (value === null || value === undefined) return undefined
    const t = String(value).trim()
    return t === '' ? undefined : t
  })
  @IsString()
  @MaxLength(80)
  title?: string
}
