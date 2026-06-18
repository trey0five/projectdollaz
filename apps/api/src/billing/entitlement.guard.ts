import { CanActivate, ExecutionContext, HttpException, Injectable } from '@nestjs/common'
import type { Request } from 'express'
import { BillingService } from './billing.service.js'

/**
 * Gates the PAID write actions (statement generate, import create). The school
 * must be ENTITLED — status 'active' OR 'trialing' with a future trial_end. Not
 * entitled => 402 with code SUBSCRIPTION_REQUIRED (the web "subscribe to
 * generate" state parses this). Runs AFTER JwtAuthGuard + RolesGuard.
 *
 * Resolves schoolId exactly like RolesGuard (params / x-school-id / body) so it
 * gates the correct tenant. isEntitled lazily ensures the trial row, so a brand
 * new school still passes during its trial window.
 */
@Injectable()
export class EntitlementGuard implements CanActivate {
  constructor(private readonly billing: BillingService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<
      Request & { params: Record<string, string>; body: Record<string, unknown> }
    >()

    const schoolId =
      req.params?.schoolId ??
      (req.headers['x-school-id'] as string | undefined) ??
      (typeof req.body?.schoolId === 'string' ? req.body.schoolId : undefined)

    // No school id resolvable — let RolesGuard's earlier checks own that case; if
    // we got here without one, fail closed on entitlement.
    if (!schoolId) {
      throw new HttpException(
        { code: 'SUBSCRIPTION_REQUIRED', message: 'No school context for entitlement.' },
        402,
      )
    }

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
}
