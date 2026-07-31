import { IsIn, IsISO8601, IsOptional, IsString, Matches, MaxLength } from 'class-validator'

/** yyyy-mm-dd only. A bare calendar day has no timezone, so it can never be
 *  reinterpreted into the previous/next day on the way through the stack. */
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/
const ISO_DAY_MESSAGE = 'must be a calendar day in yyyy-mm-dd form'

/**
 * Query DTO for GET /schools/:schoolId/accreditation/readiness/trend.
 *
 * EVERY field is explicitly decorated — the global forbidNonWhitelisted
 * ValidationPipe rejects any undecorated or unknown property with a 400, which
 * is exactly the behaviour we want (a typo'd param must fail loudly, never be
 * silently ignored and answered with a window the caller did not ask for).
 *
 * Defaults applied by the service, NOT here: granularity='day', to=today (UTC),
 * from=to−365d, seriesKey=the default series.
 */
export class ReadinessTrendQueryDto {
  /** Framework CODE, or the literal 'none'. Never a framework UUID. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  seriesKey?: string

  @IsOptional()
  @IsISO8601({ strict: true })
  @Matches(ISO_DAY, { message: `from ${ISO_DAY_MESSAGE}` })
  from?: string

  @IsOptional()
  @IsISO8601({ strict: true })
  @Matches(ISO_DAY, { message: `to ${ISO_DAY_MESSAGE}` })
  to?: string

  @IsOptional()
  @IsIn(['day', 'month'])
  granularity?: 'day' | 'month'
}

/**
 * Query DTO for GET /schools/:schoolId/accreditation/readiness/diff — the trend
 * DTO minus granularity, with from/to REQUIRED. A diff between two unspecified
 * points is meaningless, so there is deliberately no default here.
 */
export class ReadinessDiffQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  seriesKey?: string

  @IsISO8601({ strict: true })
  @Matches(ISO_DAY, { message: `from ${ISO_DAY_MESSAGE}` })
  from!: string

  @IsISO8601({ strict: true })
  @Matches(ISO_DAY, { message: `to ${ISO_DAY_MESSAGE}` })
  to!: string
}
