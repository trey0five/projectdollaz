import { IsString, MinLength } from 'class-validator'

// Typed confirmation: echo the org's exact name to delete the WHOLE organization
// (every school + all its data). Fat-finger guard on an irreversible cascade.
export class DeleteOrganizationDto {
  @IsString()
  @MinLength(1)
  confirmName!: string
}
