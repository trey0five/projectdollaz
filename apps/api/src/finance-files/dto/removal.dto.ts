import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsUUID,
  Matches,
} from 'class-validator'
import { REMOVAL_KINDS, type RemovalKind } from '../finance-files.constants.js'

/**
 * What to remove. The service checks the right fields are present for the kind
 * (400 BAD_TARGET): trial_balance → importId (ANY version id in the stack);
 * monthly → periodId + monthKeys; budget → periodId.
 */
export class RemovalTargetDto {
  @IsIn(REMOVAL_KINDS as unknown as string[])
  kind!: RemovalKind

  @IsOptional()
  @IsUUID()
  importId?: string

  @IsOptional()
  @IsUUID()
  periodId?: string

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(12)
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { each: true })
  monthKeys?: string[]
}

export class CreateRemovalDto extends RemovalTargetDto {
  /** The active version the person was looking at; a newer one → 409 CHANGED. */
  @IsOptional()
  @IsUUID()
  expectedImportId?: string
}

export class RestoreRemovalDto {
  /** Swap: move whatever fills the slot now into Recently removed, then restore. */
  @IsOptional()
  @IsBoolean()
  replaceCurrent?: boolean
}
