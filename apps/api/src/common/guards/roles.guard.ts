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
      Request & { user?: User; params: Record<string, string>; body: Record<string, unknown> }
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

    const membership = await this.prisma.membership.findUnique({
      where: { userId_schoolId: { userId: user.id, schoolId } },
    })
    if (!membership || membership.status !== 'active') {
      throw new ForbiddenException('You are not a member of this school.')
    }
    if (!required.includes(membership.role)) {
      throw new ForbiddenException('Insufficient role for this action.')
    }
    return true
  }
}
