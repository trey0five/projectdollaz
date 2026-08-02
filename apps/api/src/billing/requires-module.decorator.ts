import { SetMetadata } from '@nestjs/common'
import type { ModuleKey } from '@finrep/db'

/**
 * @RequiresModule('key') — declares which licensable module a route needs. Read
 * by EntitlementGuard via Reflector. When ABSENT, the guard runs the exact legacy
 * binary isEntitled → SUBSCRIPTION_REQUIRED path (so the ~30 existing controllers
 * are untouched). When PRESENT, the guard additionally checks isEntitledForModule
 * and emits a DISTINCT 402 { code: 'MODULE_NOT_LICENSED', module } for an
 * entitled-but-unlicensed school.
 *
 * VARIADIC, WITH **OR** SEMANTICS: `@RequiresModule('accreditation', 'strategy')`
 * admits a school that licenses EITHER. AIC Phase G's /improvement rides on the
 * two modules that can produce a recommendation — there is deliberately no
 * `improvement` module key and no third SKU to sell.
 *
 * The rest parameter is why all ~30 existing single-key call sites stay
 * BYTE-IDENTICAL: `@RequiresModule('strategy')` simply stores `['strategy']`, and
 * the guard normalises either shape. No controller file changes for this.
 */
export const REQUIRES_MODULE = 'requiresModule'

export const RequiresModule = (...keys: ModuleKey[]) => SetMetadata(REQUIRES_MODULE, keys)
