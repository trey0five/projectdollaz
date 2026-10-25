import { Type } from 'class-transformer'
import { ArrayMaxSize, IsArray, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator'
import { CreateMaintenanceDto } from '../../facilities/dto/create-maintenance.dto.js'
import { CreateGiftDto } from '../../advancement/dto/create-gift.dto.js'
import { CreateCampaignDto } from '../../advancement/dto/create-campaign.dto.js'
import { CreateStandardDto } from '../../accreditation/dto/create-standard.dto.js'

/** A gift row names its campaign (created when missing); `label` carries the donor. */
export class GiftImportRowDto extends CreateGiftDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  campaign?: string | null
}

export class ImportMaintenanceCommitDto {
  @IsArray()
  @ArrayMaxSize(2000)
  @ValidateNested({ each: true })
  @Type(() => CreateMaintenanceDto)
  rows!: CreateMaintenanceDto[]
}

export class ImportGiftsCommitDto {
  @IsArray()
  @ArrayMaxSize(5000)
  @ValidateNested({ each: true })
  @Type(() => GiftImportRowDto)
  rows!: GiftImportRowDto[]
}

export class ImportCampaignsCommitDto {
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => CreateCampaignDto)
  rows!: CreateCampaignDto[]
}

export class ImportStandardsCommitDto {
  @IsArray()
  @ArrayMaxSize(2000)
  @ValidateNested({ each: true })
  @Type(() => CreateStandardDto)
  rows!: CreateStandardDto[]
}
