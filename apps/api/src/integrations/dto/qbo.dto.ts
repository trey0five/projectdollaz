import { IsString, MinLength } from 'class-validator'

export class QbCallbackDto {
  @IsString()
  @MinLength(1)
  code!: string

  @IsString()
  @MinLength(1)
  realmId!: string
}

export class QbSyncDto {
  @IsString()
  @MinLength(1)
  periodId!: string
}
