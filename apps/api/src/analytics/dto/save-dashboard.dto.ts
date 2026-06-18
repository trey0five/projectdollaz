import { ArrayNotEmpty, IsArray } from 'class-validator'

/**
 * Phase 4C — save the per-school dashboard layout. This DTO is a COARSE
 * pre-check: it only asserts the body has a non-empty `layout` array. The
 * AUTHORITATIVE validation (known metric keys, enums, no duplicates, normalize)
 * lives in @finrep/analytics' validateDashboardLayout, reused by the service so
 * the API and package never drift on the whitelist. camelCase to match the
 * api-client / web body: { layout: [...] }.
 */
export class SaveDashboardDto {
  @IsArray()
  @ArrayNotEmpty()
  layout!: unknown[]
}
