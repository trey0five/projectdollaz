import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { Request } from 'express'
import type { User } from '@finrep/db'
import { computeIsEffectiveAdmin } from '../admin-access.js'

/**
 * Platform-admin gate. MUST run AFTER JwtAuthGuard (which sets req.user).
 * Fail-closed on every branch: no req.user or no user.email → 403. The effective-
 * admin check is BROADENED to honor the DB `isAdmin` flag in addition to the env
 * ADMIN_EMAILS allowlist and the bootstrap super-admin (see computeIsEffectiveAdmin).
 * A DB-granted admin passes even when the allowlist is empty; env admins are
 * unchanged. The identity is the JWT-loaded DB user ONLY — never a client-sent
 * field/header/body, so the global forbidNonWhitelisted pipe cannot smuggle admin
 * access. This gates the cross-tenant /admin console (SuperadminGuard gates the
 * narrower admin-management routes).
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request & { user?: User }>()
    const user = req.user
    if (!user || !user.email) {
      throw new ForbiddenException('Admin access required.')
    }
    const allow = this.config.get<string[]>('admin.emails') ?? []
    const superadmin = this.config.get<string | null>('admin.superadminUsername') ?? null
    if (!computeIsEffectiveAdmin({ email: user.email, isAdmin: user.isAdmin }, allow, superadmin)) {
      throw new ForbiddenException('Admin access required.')
    }
    return true
  }
}
