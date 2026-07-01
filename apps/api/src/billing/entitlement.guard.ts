import { CanActivate, ExecutionContext, HttpException, Injectable } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import type { Request } from 'express'
import type { ModuleKey } from '@finrep/db'
import { MODULE_META } from '@finrep/db'
import { BillingService } from './billing.service.js'
import { REQUIRES_MODULE } from './requires-module.decorator.js'

/**
 * Gates the PAID actions. The school must be ENTITLED — status 'active' OR
 * 'trialing' with a future trial_end. Not entitled => 402 with code
 * SUBSCRIPTION_REQUIRED (the web "subscribe" state parses this). Runs AFTER
 * JwtAuthGuard + RolesGuard.
 *
 * PER-MODULE (backward-compatible extension):
 *   • NO @RequiresModule metadata → EXACT legacy behavior (binary isEntitled →
 *     SUBSCRIPTION_REQUIRED). The ~30 already-gated controllers are untouched.
 *   • WITH @RequiresModule('key') → first the same isEntitled check (not entitled
 *     at all → SUBSCRIPTION_REQUIRED, so "not paying" always beats "not licensed"),
 *     then isEntitledForModule → a DISTINCT 402 { code:'MODULE_NOT_LICENSED',
 *     module } for an entitled-but-unlicensed school.
 *
 * FAIL-SAFE DIRECTION: the ONLY newly-reachable 402 (MODULE_NOT_LICENSED) requires
 * an explicit tag AND an active school whose set omits the module — a trial gets
 * all-access and a legacy/null active sub resolves to {finance}, so no school that
 * passes today can 402.
 *
 * Resolves schoolId exactly like RolesGuard (params / x-school-id / body).
 */
@Injectable()
export class EntitlementGuard implements CanActivate {
  constructor(
    private readonly billing: BillingService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<
      Request & { params: Record<string, string>; body: Record<string, unknown> }
    >()

    const schoolId =
      req.params?.schoolId ??
      (req.headers['x-school-id'] as string | undefined) ??
      (typeof req.body?.schoolId === 'string' ? req.body.schoolId : undefined)

    // No school id resolvable — let RolesGuard's earlier checks own that case; if
    // we got here without one, fail closed on entitlement. (Unchanged.)
    if (!schoolId) {
      throw new HttpException(
        { code: 'SUBSCRIPTION_REQUIRED', message: 'No school context for entitlement.' },
        402,
      )
    }

    const moduleKey = this.reflector.getAllAndOverride<ModuleKey | undefined>(REQUIRES_MODULE, [
      context.getHandler(),
      context.getClass(),
    ])

    // ── Legacy path: NO @RequiresModule → byte-for-byte the original behavior. ──
    if (!moduleKey) {
      const entitled = await this.billing.isEntitled(schoolId)
      if (!entitled) {
        throw new HttpException(
          {
            code: 'SUBSCRIPTION_REQUIRED',
            message:
              'Your trial has ended or your subscription is inactive — subscribe to continue generating statements.',
          },
          402,
        )
      }
      return true
    }

    // ── Module-aware path. "Not entitled at all" beats "not licensed". ──
    const entitled = await this.billing.isEntitled(schoolId)
    if (!entitled) {
      throw new HttpException(
        {
          code: 'SUBSCRIPTION_REQUIRED',
          message:
            'Your trial has ended or your subscription is inactive — subscribe to continue generating statements.',
        },
        402,
      )
    }

    const licensed = await this.billing.isEntitledForModule(schoolId, moduleKey)
    if (!licensed) {
      const label = MODULE_META[moduleKey]?.label ?? moduleKey
      throw new HttpException(
        {
          code: 'MODULE_NOT_LICENSED',
          module: moduleKey,
          message: `The ${label} module isn't included on your plan — add it to continue.`,
        },
        402,
      )
    }
    return true
  }
}
