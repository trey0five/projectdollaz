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
export const DOCUMENT_SOURCE_TYPES = [
  'manual',
  'policy',
  'board_report',
  'standard',
  'campaign',
  'maintenance',
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
  @IsIn(DOCUMENT_SOURCE_TYPES)
  sourceType?: DocumentSourceType

  @IsOptional()
  @IsUUID()
  sourceRef?: string
}
