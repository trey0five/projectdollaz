import { Transform } from 'class-transformer'
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator'

/**
 * Document source — the operational domain a document is optionally linked FROM.
 * 'manual' = a standalone document (the default). The rest link an EXISTING internal
 * artifact (validated ∈ the path school in the service — mirror AccreditationEvidence).
 */
/**
 * The source types an HTTP client may WRITE (create or PATCH). Deliberately
 * excludes 'roster_import': that value is the FERPA seal on retained roster
 * originals, and letting any HTTP surface write it (or write it AWAY) would let
 * a client seal an arbitrary doc into the enrollment-only door — or unseal a
 * name-bearing roster file onto the open list/search/download surfaces.
 */
export const HTTP_DOCUMENT_SOURCE_TYPES = [
  'manual',
  'policy',
  'board_report',
  'standard',
  'campaign',
  'maintenance',
  // Facilities vendors/bids — quote documents attached to a MaintenanceBid
  // (sourceRef = bidId, school-scoped in resolveLink).
  'maintenance_bid',
  // Governance Phase 2 — credential/CV docs attached to a GovernancePerson
  // (sourceRef = personId; tag convention cv|license|degree|background_check).
  'governance_person',
] as const

/**
 * The FULL set, including the one server-only value. Used by the internal
 * retention door (retainSourceFile) and by read-side plumbing (toPublic, the
 * list query) — never by a write DTO's @IsIn.
 */
export const DOCUMENT_SOURCE_TYPES = [
  ...HTTP_DOCUMENT_SOURCE_TYPES,
  // Enrollment — the ORIGINAL roster file retained at import time (sourceRef =
  // the EnrollmentImport receipt id). FERPA: these files carry student NAMES, so
  // they are deliberately kept OFF every generic surface — excluded from the
  // knowledge list, from search, and from the viewer-open download route. The
  // one door to their bytes is the enrollment controller's
  // imports/:importId/original-url, gated owner/accountant like the upload.
  // SERVER-AUTHORED ONLY: no HTTP DTO accepts this value (see
  // HTTP_DOCUMENT_SOURCE_TYPES above), and updateDocument refuses it on either
  // side of a sourceType transition.
  'roster_import',
] as const
export type DocumentSourceType = (typeof DOCUMENT_SOURCE_TYPES)[number]

/**
 * Normalize multipart `tags` into a clean string[]. Multipart text fields arrive as
 * strings, so tags may be: an already-array (repeated field), a JSON string
 * '["a","b"]', or a comma-separated string 'a,b'. Trim each, drop empties.
 */
export function normalizeTags(value: unknown): string[] | undefined {
  if (value === undefined || value === null) return undefined
  let arr: unknown[]
  if (Array.isArray(value)) {
    arr = value
  } else if (typeof value === 'string') {
    const trimmed = value.trim()
    if (trimmed === '') return []
    if (trimmed.startsWith('[')) {
      try {
        const parsed: unknown = JSON.parse(trimmed)
        arr = Array.isArray(parsed) ? parsed : [trimmed]
      } catch {
        arr = trimmed.split(',')
      }
    } else {
      arr = trimmed.split(',')
    }
  } else {
    return undefined
  }
  return arr
    .map((t) => String(t).trim())
    .filter((t) => t.length > 0)
    .slice(0, 20)
}

/**
 * Create a document — the MULTIPART TEXT fields ONLY. forbidNonWhitelisted-SAFE:
 * every field is decorated. The FILE is @UploadedFile() / req.file, DELIBERATELY NOT
 * in this DTO, so it never trips the whitelist; sizeBytes/mimeType are derived from
 * the REAL buffer server-side (never a client-declared value).
 */
export class CreateDocumentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string

  @IsOptional()
  @Transform(({ value }) => normalizeTags(value))
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(20)
  tags?: string[]

  @IsOptional()
  // The HTTP list — 'roster_import' 400s here; only retainSourceFile writes it.
  @IsIn(HTTP_DOCUMENT_SOURCE_TYPES)
  sourceType?: DocumentSourceType

  @IsOptional()
  @IsUUID()
  sourceRef?: string
}
