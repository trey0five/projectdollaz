import { Type } from 'class-transformer'
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator'
import { CreatePersonDto, MEMBER_ROLES, PERSON_GROUPS, type MemberRole, type PersonGroup } from './person.dto.js'

/** Multipart fields beside the file on a people preview (#46). */
export class ImportPeoplePreviewDto {
  /** The tile the upload came from: a board roster defaults unlabelled rows to 'board'. */
  @IsOptional()
  @IsIn(PERSON_GROUPS)
  defaultGroup?: PersonGroup

  /** JSON { fieldKey: columnIndex | null } from the mapping popup (#44). */
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  mapping?: string
}

export class ImportMappingDto {
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  mapping?: string
}

/** The reviewed rows, posted back as JSON (the file is never re-sent). */
export class ImportPeopleCommitDto {
  @IsArray()
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => CreatePersonDto)
  rows!: CreatePersonDto[]
}

export class CommitteeImportRowDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  committee!: string

  @IsOptional()
  @IsString()
  @MaxLength(80)
  kind?: string | null

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null

  /** Blank = the committee itself, no member on this row. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  member?: string | null

  @IsOptional()
  @IsIn(MEMBER_ROLES)
  role?: MemberRole

  @IsOptional()
  @IsString()
  @MaxLength(200)
  email?: string | null
}

export class ImportCommitteesCommitDto {
  @IsArray()
  @ArrayMaxSize(2000)
  @ValidateNested({ each: true })
  @Type(() => CommitteeImportRowDto)
  rows!: CommitteeImportRowDto[]
}
