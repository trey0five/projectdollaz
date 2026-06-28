import { Type } from 'class-transformer'
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator'

export class ChatMessageDto {
  @IsIn(['user', 'assistant'])
  role!: 'user' | 'assistant'

  @IsString()
  @MaxLength(8000)
  content!: string
}

/**
 * A file attached to the latest user turn. The client sends bytes as raw base64
 * (NO "data:...;base64," prefix). Caps here are first-line defence; the service
 * re-decodes and re-checks the true decoded byte length (never trusts `size`).
 * Base64 inflates ~4/3, so an 8MB decoded cap is ~10.67MB encoded — 11.5MB string
 * cap leaves headroom while still bounding the request body.
 */
export class ChatAttachmentDto {
  @IsString()
  @MaxLength(255)
  name!: string

  @IsIn(['xlsx', 'csv', 'pdf', 'image'])
  kind!: 'xlsx' | 'csv' | 'pdf' | 'image'

  @IsString()
  @MaxLength(120)
  mimeType!: string

  @IsInt()
  @Min(1)
  @Max(8_000_000)
  size!: number

  @IsString()
  @MaxLength(11_500_000)
  dataBase64!: string
}

export class ChatDto {
  @IsOptional()
  @IsString()
  periodId?: string

  @IsArray()
  @ArrayMaxSize(40)
  @ValidateNested({ each: true })
  @Type(() => ChatMessageDto)
  messages!: ChatMessageDto[]

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(4)
  @ValidateNested({ each: true })
  @Type(() => ChatAttachmentDto)
  attachments?: ChatAttachmentDto[]
}
