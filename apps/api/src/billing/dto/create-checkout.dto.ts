import { ArrayNotEmpty, IsArray, IsIn, IsOptional, IsString } from 'class-validator'

export type BillingPlan = 'monthly' | 'yearly'

// Single checkout DTO covering BOTH paths (forbidNonWhitelisted-safe — exactly
// `plan`, `modules`, `interval` are whitelisted; any other field → 400):
//   • Legacy base plan   → { plan: 'monthly' | 'yearly' }
//   • Modular per-module → { modules: ['governance', ...], interval?: 'monthly' }
// The controller branches on the presence of `modules`; the service enforces the
// exact validation (unknown/unpriced module → clear 400).
export class CreateCheckoutDto {
  // Legacy single-base-price path. Optional now that the modular path exists.
  @IsOptional()
  @IsIn(['monthly', 'yearly'])
  plan?: BillingPlan

  // Modular path: the sellable module keys to include (core added implicitly).
  // Key validity + configured-price checks happen in the service so the 400 body
  // carries a specific code (MODULE_PRICE_NOT_CONFIGURED / the offending key).
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  modules?: string[]

  // Optional billing interval; v1 is monthly-only, kept for forward-compat.
  @IsOptional()
  @IsIn(['monthly', 'yearly'])
  interval?: BillingPlan
}
