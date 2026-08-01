import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator'
import { REQUIREMENT_TAGS } from '@finrep/compliance'
import {
  EVIDENCE_KINDS,
  EVIDENCE_SOURCE_TYPES,
  type EvidenceKind,
  type EvidenceSourceType,
} from './create-evidence.dto.js'

/**
 * Phase 4 depth — PATCH an evidence artifact. MIRRORS CreateEvidenceDto but every field
 * is @IsOptional (partial PATCH): an OMITTED key keeps the current value; an explicit
 * `null` on a nullable field CLEARS it (reference/notes/capturedAt). forbidNonWhitelisted
 * -SAFE: every field is decorated, so a stray key 400s. There is DELIBERATELY NO
 * `standardId` (it comes from the nested path). Re-linking (changing sourceType/sourceRef)
 * is re-validated ∈ the path school in the service exactly like create.
 */
export class UpdateEvidenceDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string

  @IsOptional()
  @IsIn(EVIDENCE_KINDS)
  kind?: EvidenceKind

  @IsOptional()
  @IsIn(EVIDENCE_SOURCE_TYPES)
  sourceType?: EvidenceSourceType

  @IsOptional()
  @IsUUID()
  sourceRef?: string | null

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

  // ── AIC Phase C — evidence CURRENCY. All four are PATCH-able and clearable
  // with an explicit null; all four MUST be whitelisted here or the global
  // forbidNonWhitelisted pipe 400s the request (the live-caught gotcha).

  /** Requirement tag this artifact answers (@finrep/compliance REQUIREMENT_TAGS). */
  @IsOptional()
  @IsIn(REQUIREMENT_TAGS)
  tag?: string | null

  /** "Which period does this cover?" — yyyy-mm-dd. Never inferred. */
  @IsOptional()
  @IsDateString()
  effectiveDate?: string | null

  @IsOptional()
  @IsDateString()
  expiresAt?: string | null

  /** School-asserted: this also lives in your accreditor's portal. */
  @IsOptional()
  @IsBoolean()
  alsoInPortal?: boolean | null
}
