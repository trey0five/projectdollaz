// ─────────────────────────────────────────────────────────────────────────────
// AIC Phase K — PROFESSIONAL-DEVELOPMENT DTOs.
//
// THERE IS NO COST FIELD, AND THAT IS THE DESIGN. The hole this register closes
// said so in its own copy: "We will not use PD spend as a proxy — one expensive
// conference for one person would score as healthy." A field that exists is a
// field something eventually reads, so the money never enters the product.
// `hours` is here and is deliberately NOT used to score participation either: a
// person with a record participated, whatever the hours say.
// ─────────────────────────────────────────────────────────────────────────────
import { Type } from 'class-transformer'
import {
  IsBoolean,
  IsIn,
  IsISO8601,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator'

export const PD_CATEGORIES = [
  'instructional',
  'catholic_identity',
  'leadership',
  'safety',
  'technology',
  'other',
] as const
export type PdCategory = (typeof PD_CATEGORIES)[number]

export class CreateProfessionalDevelopmentDto {
  @IsUUID()
  personId!: string

  @IsString()
  @MaxLength(160)
  title!: string

  @IsISO8601()
  activityDate!: string

  /** Contact hours. Recorded for the register's own sake; never scores anything. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(9999)
  hours?: number

  @IsOptional()
  @IsIn(PD_CATEGORIES)
  category?: PdCategory

  @IsOptional()
  @IsBoolean()
  verified?: boolean

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string
}

export class UpdateProfessionalDevelopmentDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  title?: string

  @IsOptional()
  @IsISO8601()
  activityDate?: string

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(9999)
  hours?: number

  @IsOptional()
  @IsIn(PD_CATEGORIES)
  category?: PdCategory

  @IsOptional()
  @IsBoolean()
  verified?: boolean

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string
}

export class ListProfessionalDevelopmentQueryDto {
  @IsOptional()
  @IsIn(PD_CATEGORIES)
  category?: PdCategory

  /** Restrict to activity on or after this date (the participation look-back). */
  @IsOptional()
  @IsISO8601()
  since?: string

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  pageSize?: number
}
