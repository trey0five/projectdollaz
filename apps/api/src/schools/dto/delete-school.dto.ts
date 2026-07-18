import { IsString, MinLength } from 'class-validator'

// Typed confirmation: the caller must echo the school's exact name to delete it —
// a fat-finger guard on a destructive, cascading, irreversible operation.
export class DeleteSchoolDto {
  @IsString()
  @MinLength(1)
  confirmName!: string
}
