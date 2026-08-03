import { IsOptional, IsUUID } from 'class-validator'

/**
 * AIC Phase H — the query for GET /schools/:schoolId/accreditation/visit.
 *
 * EVERY field is explicitly decorated. The global `forbidNonWhitelisted`
 * ValidationPipe 400s any undecorated or unknown property, which is exactly right:
 * a typo'd param must fail loudly rather than be silently ignored and answered
 * with a Mock Visit built from a period the caller did not ask for.
 *
 * EXACTLY ONE FIELD, AND DELIBERATELY NOT TWO. `periodId` is forwarded to the
 * commendations service, which already accepts it and already tenant-checks it.
 * There is NO `frameworkId` passthrough "for symmetry": the twin resolves the
 * framework itself, and a second resolver reachable from the query is how one
 * payload ends up describing two frameworks at once.
 */
export class VisitQueryDto {
  /** Fiscal period whose operating figures the commendations describe. */
  @IsOptional()
  @IsUUID()
  periodId?: string
}
