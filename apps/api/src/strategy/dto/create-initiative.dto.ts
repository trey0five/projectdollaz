import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator'
import { INITIATIVE_STATUSES, type InitiativeStatus } from '../strategy.constants.js'

/** Create an initiative under a goal. forbidNonWhitelisted-SAFE. */
export class CreateInitiativeDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null

  @IsOptional()
  @IsIn(INITIATIVE_STATUSES)
  status?: InitiativeStatus

  @IsOptional()
  @IsUUID()
  ownerUserId?: string | null

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  orderIndex?: number
}
