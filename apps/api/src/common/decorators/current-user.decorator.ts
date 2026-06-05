import { createParamDecorator, type ExecutionContext } from '@nestjs/common'
import type { User } from '@finrep/db'

/** Injects req.user (set by JwtAuthGuard). */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): User => {
    const req = ctx.switchToHttp().getRequest<{ user: User }>()
    return req.user
  },
)
