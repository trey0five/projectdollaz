import { IsDateString, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator'

/** Evidence kind — a small closed enum (re-validated / defaulted in the service). */
export const EVIDENCE_KINDS = ['document', 'link', 'note'] as const
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number]

/**
 * Create an evidence artifact under a standard. forbidNonWhitelisted-SAFE: every
 * field is decorated. There is DELIBERATELY NO `standardId` in the body — it comes
 * from the nested path param (/standards/:standardId/evidence), which both prevents
 * a body/path mismatch and closes the cross-standard retarget vector. `kind` defaults
 * to 'document' in the service when omitted. Nullable fields use @IsOptional so
 * `null` passes (same pattern as the policy DTOs).
 *
 * v1 is CREATE + DELETE only (no update-evidence DTO — edit deferred).
 */
export class CreateEvidenceDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string

  @IsOptional()
  @IsIn(EVIDENCE_KINDS)
  kind?: EvidenceKind

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reference?: string | null

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string | null

  @IsOptional()
  @IsDateString()
  capturedAt?: string | null
}
