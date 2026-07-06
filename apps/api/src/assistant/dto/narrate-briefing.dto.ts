import { IsBoolean, IsIn, IsOptional, IsString, Matches } from 'class-validator'
import type { Lens } from '../../analytics/briefing-lens.js'

type DayPart = 'morning' | 'afternoon' | 'evening'

/**
 * Body for POST /schools/:schoolId/assistant/briefing-narration. Every field is
 * whitelisted (the global forbidNonWhitelisted ValidationPipe 400s any stray key)
 * and every field is optional — a bare `{}` narrates the on-screen period at the
 * caller's own lens. `lens` can only NARROW (the service clamps to the caller's
 * ceiling exactly like the GET briefing routes). `dayPart` is display-only (the
 * server doesn't know the browser TZ); default 'morning'. `regenerate` bypasses
 * the content-hash cache.
 */
export class NarrateBriefingDto {
  @IsOptional()
  @IsString()
  periodId?: string

  @IsOptional()
  @IsIn(['owner', 'accountant', 'viewer'], { message: 'lens must be owner, accountant, or viewer' })
  lens?: Lens

  @IsOptional()
  @IsIn(['morning', 'afternoon', 'evening'], { message: 'dayPart must be morning, afternoon, or evening' })
  dayPart?: DayPart

  @IsOptional()
  @IsBoolean()
  regenerate?: boolean
}

/**
 * Body for POST /organizations/:orgId/briefing-narration. `fiscalYearStart` mirrors
 * the org briefing's YYYY-MM param; omit to roll up each school's latest snapshot.
 */
export class NarrateOrgBriefingDto {
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}$/, { message: 'fiscalYearStart must be YYYY-MM' })
  fiscalYearStart?: string

  @IsOptional()
  @IsIn(['owner', 'accountant', 'viewer'], { message: 'lens must be owner, accountant, or viewer' })
  lens?: Lens

  @IsOptional()
  @IsIn(['morning', 'afternoon', 'evening'], { message: 'dayPart must be morning, afternoon, or evening' })
  dayPart?: DayPart

  @IsOptional()
  @IsBoolean()
  regenerate?: boolean
}
