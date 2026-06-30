import { createParamDecorator, type ExecutionContext } from '@nestjs/common'
import type { MembershipRole } from '@finrep/db'

/**
 * Injects the caller's resolved membership role for the target school, attached
 * to the request by RolesGuard (req.membershipRole). RolesGuard always runs
 * before the handler on @Roles()-guarded routes and already does the membership
 * lookup, so this is query-free and guaranteed present in practice. Returns
 * undefined if (defensively) the guard chain didn't attach it — callers should
 * fail safe to the most restrictive lens.
 */
export const CallerRole = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): MembershipRole | undefined => {
    const req = ctx.switchToHttp().getRequest<{ membershipRole?: MembershipRole }>()
    return req.membershipRole
  },
)
