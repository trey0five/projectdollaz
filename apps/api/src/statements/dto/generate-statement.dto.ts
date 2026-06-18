import { IsOptional, IsUUID } from 'class-validator'

/**
 * Optional explicit comparative overrides. When provided, the resolver uses these
 * imports instead of the history-derived comparatives (each verified to belong to
 * the school). Omit both to use the documented auto-resolution rule.
 */
export class GenerateStatementDto {
  @IsOptional()
  @IsUUID()
  pyImportId?: string

  @IsOptional()
  @IsUUID()
  auditImportId?: string
}
