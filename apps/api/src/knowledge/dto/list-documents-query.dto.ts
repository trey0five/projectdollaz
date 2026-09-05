import { IsIn, IsOptional, IsUUID } from 'class-validator'
import { DOCUMENT_SOURCE_TYPES, type DocumentSourceType } from './create-document.dto.js'

/**
 * Optional query filters for the document list. forbidNonWhitelisted-safe: both fields
 * decorated + @IsOptional. sourceRef lets a linked entity (e.g. a policy page) list
 * ONLY its own attached documents.
 */
export class ListDocumentsQueryDto {
  @IsOptional()
  // Deliberately the FULL set (not the HTTP write list): this is a READ filter,
  // and asking for 'roster_import' is answered with an empty list in the service
  // — the seal is silence, not a 400 that confirms the register exists.
  @IsIn(DOCUMENT_SOURCE_TYPES)
  sourceType?: DocumentSourceType

  @IsOptional()
  @IsUUID()
  sourceRef?: string
}
