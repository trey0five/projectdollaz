import { Transform } from 'class-transformer'
import { IsEmail, IsIn } from 'class-validator'
import type { MembershipRole } from '@finrep/db'

export class CreateInvitationDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail()
  email!: string

  @IsIn(['owner', 'accountant', 'viewer'])
  role!: MembershipRole
}
