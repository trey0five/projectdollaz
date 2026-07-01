import { SetMetadata } from '@nestjs/common'
import type { ModuleKey } from '@finrep/db'

/**
 * @RequiresModule('key') — declares which licensable module a route needs. Read
 * by EntitlementGuard via Reflector. When ABSENT, the guard runs the exact legacy
 * binary isEntitled → SUBSCRIPTION_REQUIRED path (so the ~30 existing controllers
 * are untouched). When PRESENT, the guard additionally checks isEntitledForModule
 * and emits a DISTINCT 402 { code: 'MODULE_NOT_LICENSED', module } for an
 * entitled-but-unlicensed school.
 */
export const REQUIRES_MODULE = 'requiresModule'

export const RequiresModule = (key: ModuleKey) => SetMetadata(REQUIRES_MODULE, key)
