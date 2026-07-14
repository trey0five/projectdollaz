import { IsIn } from 'class-validator'
import type { ModuleKey } from '@finrep/db'
import { SELLABLE_MODULE_KEYS } from '@finrep/db'

// Body for POST /schools/:schoolId/billing/modules (the PRE-STRIPE FREE UNLOCK
// STUB). Exactly ONE whitelisted field, so the global forbidNonWhitelisted
// ValidationPipe 400s any extra field. @IsIn against the runtime
// SELLABLE_MODULE_KEYS const rejects bogus keys AND 'core' (core is always-on,
// never sellable, and is not in that array) at the pipe — before the service.
export class AddModuleDto {
  @IsIn(SELLABLE_MODULE_KEYS)
  key!: ModuleKey
}
