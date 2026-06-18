import { IsIn } from 'class-validator'
import type { MembershipRole } from '@finrep/db'

export class UpdateMemberRoleDto {
  @IsIn(['owner', 'accountant', 'viewer'])
  role!: MembershipRole
}
