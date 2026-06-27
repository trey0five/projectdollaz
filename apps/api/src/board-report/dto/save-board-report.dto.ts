import { Allow, IsBoolean, IsIn, IsObject, IsOptional, IsString, MaxLength } from 'class-validator'

/**
 * PUT .../board-report body. Every field optional + merge-pick (undefined = keep,
 * null = clear), mirroring BudgetService.upsert. EVERY field is decorated or the
 * global forbidNonWhitelisted ValidationPipe strips/400s it.
 *
 * `explanations` is free-form JSON ({ revenue:{key:text}, expense:{key:text} }):
 * @IsObject + @Allow() lets it pass the whitelist; the SERVICE validates its
 * shape and clamps each value to <=2000 chars (the DTO can't reach into nested
 * free-form keys).
 *
 * `granularity` is @IsIn(['annual']) — monthly/quarterly are rejected at the API.
 */
export class SaveBoardReportDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  reportTitle?: string | null

  @IsOptional()
  @IsString()
  @MaxLength(120)
  committeeName?: string | null

  @IsOptional()
  @IsString()
  @IsIn(['annual'])
  granularity?: string

  @IsOptional()
  @IsString()
  @MaxLength(20000)
  mdaText?: string | null

  @IsOptional()
  @IsString()
  @IsIn(['rule', 'llm', 'user'])
  mdaSource?: string

  @IsOptional()
  @IsObject()
  @Allow()
  explanations?: Record<string, unknown> | null

  @IsOptional()
  @IsBoolean()
  markGenerated?: boolean
}
