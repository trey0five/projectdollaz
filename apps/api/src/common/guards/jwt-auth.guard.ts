import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common'
import type { Request } from 'express'
import type { User } from '@finrep/db'
import { PrismaService } from '../../prisma/prisma.service.js'
import { TokenService } from '../../auth/token.service.js'

/**
 * Verifies the Bearer ACCESS token, loads the user, and sets req.user. Also
 * bumps the user's refresh-token last-activity (like smartbot get_current_user).
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly tokens: TokenService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request & { user?: User }>()
    const header = req.headers.authorization
    if (!header || !header.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer token.')
    }
    const token = header.slice('Bearer '.length).trim()
    const payload = this.tokens.verifyAccess(token)

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } })
    if (!user) {
      throw new UnauthorizedException('User no longer exists.')
    }
    req.user = user
    // Best-effort activity bump on the SPECIFIC session (sid = paired refresh
    // jti); never block the request on it.
    void this.tokens.touchActivity(user.id, payload.sid).catch(() => undefined)
    return true
  }
}
