import { IsIn, IsOptional, IsString } from 'class-validator'

/**
 * POST .../board-report/mda body. An empty body `{}` is valid (defaults to a
 * standard tone). `tone` is whitelisted via @IsIn or the global pipe 400s it.
 */
export class MdaBoardReportDto {
  @IsOptional()
  @IsString()
  @IsIn(['concise', 'standard', 'detailed'])
  tone?: 'concise' | 'standard' | 'detailed'
}
