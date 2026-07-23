import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { Request } from 'express'
import type { User } from '@finrep/db'

/**
 * Platform super-admin gate. MUST run AFTER JwtAuthGuard (which sets req.user).
 * Fail-closed on every branch: no req.user, no user.email, empty allowlist, or an
 * email not in the (case/space-normalized) ADMIN_EMAILS list → 403. The identity
 * is the JWT-loaded DB user's email ONLY — never a client-sent field/header/body,
 * so the global forbidNonWhitelisted pipe cannot be used to smuggle admin access.
 * This is the SOLE gate on the cross-tenant /admin endpoints.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request & { user?: User }>()
    const user = req.user
    const allow = this.config.get<string[]>('admin.emails') ?? []
    if (!user || !user.email || allow.length === 0) {
      throw new ForbiddenException('Admin access required.')
    }
    if (!allow.includes(user.email.trim().toLowerCase())) {
      throw new ForbiddenException('Admin access required.')
    }
    return true
  }
}
