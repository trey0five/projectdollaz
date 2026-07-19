import { IsString, MinLength } from 'class-validator'

// Re-authenticate with the current password to erase your own account — prevents
// a hijacked session (or CSRF) from deleting an account outright.
export class DeleteAccountDto {
  @IsString()
  @MinLength(1)
  password!: string
}
