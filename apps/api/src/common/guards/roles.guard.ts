import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import type { Request } from 'express'
import type { MembershipRole, User } from '@finrep/db'
import { PrismaService } from '../../prisma/prisma.service.js'
import { ROLES_KEY } from '../decorators/roles.decorator.js'

/**
 * Resolves the TARGET school (from :schoolId param, X-School-Id header, or body)
 * and enforces that req.user has an ACTIVE membership whose role is in @Roles().
 * No membership => 403 (tenant isolation). Wrong role => 403.
 *
 * Runs AFTER JwtAuthGuard so req.user is present.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<MembershipRole[] | undefined>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    )
    if (!required || required.length === 0) return true

    const req = context.switchToHttp().getRequest<
      Request & {
        user?: User
        params: Record<string, string>
        body: Record<string, unknown>
        membershipRole?: MembershipRole
      }
    >()
    const user = req.user
    if (!user) throw new ForbiddenException('Not authenticated.')

    const schoolId =
      req.params?.schoolId ??
      (req.headers['x-school-id'] as string | undefined) ??
      (typeof req.body?.schoolId === 'string' ? req.body.schoolId : undefined)

    if (!schoolId) {
      throw new ForbiddenException('Target school id is required.')
    }

    // A malformed (non-UUID) schoolId would make Prisma throw an unhandled error
    // and surface as a 500. Treat any lookup failure as "no membership" (403) —
    // semantically identical to a school you cannot belong to, and consistent
    // across all tenant-isolated controllers (analytics/operational/compliance).
    let membership: Awaited<ReturnType<typeof this.prisma.membership.findUnique>> = null
    try {
      membership = await this.prisma.membership.findUnique({
        where: { userId_schoolId: { userId: user.id, schoolId } },
      })
    } catch {
      throw new ForbiddenException('You are not a member of this school.')
    }
    if (!membership || membership.status !== 'active') {
      throw new ForbiddenException('You are not a member of this school.')
    }
    if (!required.includes(membership.role)) {
      throw new ForbiddenException('Insufficient role for this action.')
    }
    // Attach the resolved role so handlers (via @CallerRole()) can role-shape the
    // response WITHOUT a second DB hit. Distinct property name (never overwrites
    // req.user) so no other guard/interceptor is affected. Single writer, runs
    // before the handler, so it is always present downstream on @Roles() routes.
    req.membershipRole = membership.role
    return true
  }
}
