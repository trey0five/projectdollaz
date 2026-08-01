import { IsOptional, IsUUID } from 'class-validator'

/**
 * Query DTO for GET /schools/:schoolId/accreditation/evidence-readiness.
 *
 * EVERY field must be explicitly decorated — the global forbidNonWhitelisted
 * ValidationPipe rejects any unknown property with a 400, which is exactly
 * right: a typo'd param must fail loudly rather than be silently ignored and
 * answered about a framework the caller did not ask for.
 *
 * Default applied by the service, not here: the school's DOMINANT framework —
 * the same rule the readiness hero uses, so the two never disagree.
 */
export class EvidenceReadinessQueryDto {
  @IsOptional()
  @IsUUID()
  frameworkId?: string
}
