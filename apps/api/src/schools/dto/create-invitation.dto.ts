import { Transform } from 'class-transformer'
import { IsBoolean, IsEmail, IsIn, IsOptional } from 'class-validator'
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
}
