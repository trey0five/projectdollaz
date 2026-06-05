import { SetMetadata } from '@nestjs/common'
import type { MembershipRole } from '@finrep/db'

export const ROLES_KEY = 'roles'

/** Restrict a route to callers whose membership role for the target school is in `roles`. */
export const Roles = (...roles: MembershipRole[]) => SetMetadata(ROLES_KEY, roles)
