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
import { DOCUMENT_SOURCE_TYPES, normalizeTags, type DocumentSourceType } from './create-document.dto.js'

/**
 * Patch a document's METADATA only (JSON body). DELIBERATELY has NO fileName / s3Key /
 * sizeBytes / mimeType — a client can never mutate the stored bytes or the object key
 * through this route. A changed link (sourceType/sourceRef) is re-validated in the
 * service. forbidNonWhitelisted-safe: every field decorated, all @IsOptional (partial).
 */
export class UpdateDocumentDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null

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
  sourceRef?: string | null
}
