import { IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator'

/** Create a pillar under a plan. forbidNonWhitelisted-SAFE. */
export class CreatePillarDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  orderIndex?: number
}
