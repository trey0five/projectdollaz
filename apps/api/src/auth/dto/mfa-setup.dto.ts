import { IsString, MaxLength } from 'class-validator'

// Starting enrollment re-proves the password (a hijacked session must not be
// able to enroll its own authenticator).
export class MfaSetupDto {
  @IsString()
  @MaxLength(128)
  password!: string
}
