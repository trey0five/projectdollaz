import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { Request } from 'express'
import type { User } from '@finrep/db'
import { computeIsSuperadmin } from '../admin-access.js'

/**
 * Bootstrap super-admin gate. MUST run AFTER JwtAuthGuard (which sets req.user).
 * This is the SOLE gate on the admin-MANAGEMENT routes (list/create/revoke admins):
 * a regular DB admin (isAdmin=true, not the super-admin) passes AdminGuard for the
 * console but is 403'd here, so it can neither create nor revoke admins nor self-
 * promote. The identity is the JWT-loaded DB user's email ONLY — never a client-sent
 * field — so forbidNonWhitelisted cannot be used to smuggle super-admin access.
 */
@Injectable()
export class SuperadminGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request & { user?: User }>()
    const user = req.user
    const superadmin = this.config.get<string | null>('admin.superadminUsername') ?? null
    if (!user || !user.email || !computeIsSuperadmin(user.email, superadmin)) {
      throw new ForbiddenException('Super-admin access required.')
    }
    return true
  }
}