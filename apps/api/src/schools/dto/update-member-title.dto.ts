import { Transform } from 'class-transformer'
import { IsOptional, IsString, MaxLength } from 'class-validator'

/**
 * A member's POSITION at this school — free text, because school org charts are
 * not an enum ("Head of School", "Director of Advancement", "Business Manager",
 * "Principal / Interim CFO"). Clearing it is a first-class action: an empty
 * string normalises to null rather than storing a blank position.
 */
export class UpdateMemberTitleDto {
  @IsOptional()
  @Transform(({ value }) => {
    if (value === null || value === undefined) return null
    const t = String(value).trim()
    return t === '' ? null : t
  })
  @IsString()
  @MaxLength(80)
  title!: string | null
}
