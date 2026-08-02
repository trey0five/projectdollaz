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
 *   • WITH @RequiresModule('a', 'b') → **OR**: licensing EITHER admits the route.
 *     The 402 names `module: keys[0]` (the primary, so the web's existing
 *     single-key parser keeps working) and ADDITIONALLY carries `modules` — a
 *     field that appears only on multi-key routes, so a single-key body is
 *     byte-identical to what shipped before.
 *
 * RESOLUTION: trialing and active subscriptions BOTH resolve their licensed set
 * the same way (legacy/NULL → {finance} + always-on core), so a tagged sellable
 * module 402s MODULE_NOT_LICENSED until it is unlocked via the membership
 * section (pre-Stripe unlock stub / future per-module checkout).
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

    const raw = this.reflector.getAllAndOverride<ModuleKey[] | ModuleKey | undefined>(
      REQUIRES_MODULE,
      [context.getHandler(), context.getClass()],
    )
    // NORMALISE. The decorator is variadic and always stores an array, but a
    // SCALAR can still arrive — from a stale compiled artifact mid-deploy, or
    // from a mocked Reflector in a spec written before this change. Treating it
    // as a one-element list is why every existing entitlement spec stays green
    // byte-for-byte, so this is load-bearing rather than defensive.
    const keys: ModuleKey[] = Array.isArray(raw) ? raw : raw ? [raw] : []

    // ── Legacy path: NO @RequiresModule → byte-for-byte the original behavior. ──
    if (keys.length === 0) {
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

    // OR semantics. The SHORT-CIRCUIT is deliberate: a school that licenses the
    // first key must not pay a second round-trip to discover it also licenses
    // the second.
    for (const k of keys) {
      if (await this.billing.isEntitledForModule(schoolId, k)) return true
    }

    const labels = keys.map((k) => MODULE_META[k]?.label ?? k)
    throw new HttpException(
      {
        code: 'MODULE_NOT_LICENSED',
        // The PRIMARY key. apps/web's moduleKeyFromError reads this field and is
        // unchanged; a single-key route's 402 body is byte-identical to today's.
        module: keys[0],
        // ADDITIVE, and present ONLY on a multi-key route — so no existing
        // parser ever sees a field it was not written against.
        ...(keys.length > 1 ? { modules: keys } : {}),
        message:
          keys.length > 1
            ? `This needs the ${labels.slice(0, -1).join(', ')} or ${labels[labels.length - 1]} module — add either one to continue.`
            : `The ${labels[0]} module isn't included on your plan — add it to continue.`,
      },
      402,
    )
  }
}
