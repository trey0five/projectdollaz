import { IsBoolean } from 'class-validator'

// Owner-only: toggle a member between org-wide access (a membership on every
// school in the org) and single-school access (this school only).
export class UpdateMemberAccessDto {
  @IsBoolean()
  orgWide!: boolean
}
