import { Type } from 'class-transformer'
import {
  ArrayMaxSize,
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator'
import {
  CAMPAIGN_COMMENT_MAX,
  CAMPAIGN_GROUP_MAX,
  CAMPAIGN_ITEMS_MAX,
  CAMPAIGN_LABEL_MAX,
  CAMPAIGN_NAME_MAX,
} from '../schedule.constants.js'

/**
 * One capital-campaign line. EVERY field is decorated or the global
 * forbidNonWhitelisted ValidationPipe strips/400s it. Web sends real JSON
 * numbers, so @IsNumber() is correct (no implicit string->number coercion).
 * `group` is FREE-TEXT (NO @IsIn — campaigns name their own divisions).
 * budget/estimate are non-negative (@Min(0)); difference (= budget − estimate)
 * is NOT stored (computed server-side in assemble).
 */
export class CampaignItemDto {
  // Client-generated id, round-trips for React keys. Service echoes/normalizes it.
  @IsOptional()
  @IsString()
  @MaxLength(64)
  id?: string

  @IsString()
  @MaxLength(CAMPAIGN_GROUP_MAX)
  group!: string

  @IsString()
  @MaxLength(CAMPAIGN_LABEL_MAX)
  label!: string

  @IsNumber()
  @Min(0)
  budget!: number

  @IsNumber()
  @Min(0)
  estimate!: number

  @IsOptional()
  @IsString()
  @MaxLength(CAMPAIGN_COMMENT_MAX)
  comment?: string
}

/** PUT .../campaign-schedule body — bulk-replaces campaignName + the whole items array. */
export class SaveCampaignScheduleDto {
  @IsOptional()
  @IsString()
  @MaxLength(CAMPAIGN_NAME_MAX)
  campaignName?: string

  @IsArray()
  @ArrayMaxSize(CAMPAIGN_ITEMS_MAX)
  @ValidateNested({ each: true })
  @Type(() => CampaignItemDto)
  items!: CampaignItemDto[]
}
