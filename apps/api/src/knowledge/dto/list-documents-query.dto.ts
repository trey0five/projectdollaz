import { IsIn, IsOptional, IsUUID } from 'class-validator'
import { DOCUMENT_SOURCE_TYPES, type DocumentSourceType } from './create-document.dto.js'

/**
 * Optional query filters for the document list. forbidNonWhitelisted-safe: both fields
 * decorated + @IsOptional. sourceRef lets a linked entity (e.g. a policy page) list
 * ONLY its own attached documents.
 */
export class ListDocumentsQueryDto {
  @IsOptional()
  @IsIn(DOCUMENT_SOURCE_TYPES)
  sourceType?: DocumentSourceType

  @IsOptional()
  @IsUUID()
  sourceRef?: string
}
