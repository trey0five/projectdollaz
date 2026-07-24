import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator'

/**
 * Body for POST /admin/messages (admin-gated). FLATTENED target: a string
 * `target` + an optional top-level `userIds`, so the polymorphic shape validates
 * cleanly under the global whitelist + forbidNonWhitelisted pipe. `userIds` is
 * required & non-empty iff target==='users' (enforced in the service); ignored for
 * target==='all'.
 */
export class SendMessageDto {
  @IsIn(['all', 'users'])
  target!: 'all' | 'users'

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(5000)
  @IsUUID('4', { each: true })
  userIds?: string[]

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  subject!: string

  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  body!: string

  @IsOptional()
  @IsString()
  @MaxLength(80)
  senderLabel?: string
}
