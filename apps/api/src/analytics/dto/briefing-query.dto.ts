import { IsIn, IsOptional } from 'class-validator'
import type { Lens } from '../briefing-lens.js'

/**
 * Query for the per-school attention briefing. The global forbidNonWhitelisted
 * ValidationPipe rejects any field not whitelisted here, so `lens` MUST be
 * @-decorated or `?lens=…` 400s. @IsIn rejects garbage at the boundary, so the
 * service never has to defend against unknown lens strings — only the three real
 * RBAC roles (owner | accountant | viewer) are accepted. The server still CLAMPS
 * the (valid) requested lens to the caller's ceiling, so this param can only ever
 * NARROW the view, never widen it.
 */
export class BriefingQueryDto {
  @IsOptional()
  @IsIn(['owner', 'accountant', 'viewer'], {
    message: 'lens must be owner, accountant, or viewer',
  })
  lens?: Lens
}
