import { IsDateString, IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator'

/** Evidence kind — a small closed enum (re-validated / defaulted in the service). */
export const EVIDENCE_KINDS = ['document', 'link', 'note'] as const
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number]

/**
 * Evidence source — the operational domain a linked evidence was attached FROM.
 * 'manual' = today's free-text evidence (the default). 'policy'/'board_report' link
 * an EXISTING internal artifact (validated ∈ the path school in the service).
 */
export const EVIDENCE_SOURCE_TYPES = ['manual', 'policy', 'board_report'] as const
export type EvidenceSourceType = (typeof EVIDENCE_SOURCE_TYPES)[number]

/**
 * Create an evidence artifact under a standard. forbidNonWhitelisted-SAFE: every
 * field is decorated. There is DELIBERATELY NO `standardId` in the body — it comes
 * from the nested path param (/standards/:standardId/evidence), which both prevents
 * a body/path mismatch and closes the cross-standard retarget vector. `kind` defaults
 * to 'document' in the service when omitted. Nullable fields use @IsOptional so
 * `null` passes (same pattern as the policy DTOs).
 *
 * v1 is CREATE + DELETE only (no update-evidence DTO — edit deferred).
 *
 * LINKED EVIDENCE (auto-link from operations): when sourceType != 'manual', the caller
 * may OMIT title — the service auto-derives it from the linked artifact. `title` is
 * therefore optional at the DTO level; the service RE-ENFORCES "manual requires a
 * non-empty title", preserving today's guarantee for the manual path.
 */
export class CreateEvidenceDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string

  @IsOptional()
  @IsIn(EVIDENCE_KINDS)
  kind?: EvidenceKind

  /** Source domain — 'manual' (default) or a linked artifact ('policy' | 'board_report'). */
  @IsOptional()
  @IsIn(EVIDENCE_SOURCE_TYPES)
  sourceType?: EvidenceSourceType

  /** The linked artifact's uuid (Policy.id / BoardReport.id). Required iff sourceType != 'manual'. */
  @IsOptional()
  @IsUUID()
  sourceRef?: string

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
