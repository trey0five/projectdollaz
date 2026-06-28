import {
  IsObject,
  IsNotEmptyObject,
  registerDecorator,
  type ValidationOptions,
} from 'class-validator'

/**
 * A category-pick map: each KEY is a GL-number string (e.g. "612") or a
 * `label:<normalized-label>` key (the spreadRowKey form), and each VALUE is an
 * SCoA category key string. class-validator has no built-in "string→string map,
 * each, capped" check, so register a small custom one. DEEP value membership
 * (value ∈ SCoA categories) is enforced in MappingService.mergeEntries so the
 * 24-key set stays single-sourced from the engine.
 */
function IsStringMap(maxKeys: number, options?: ValidationOptions) {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      name: 'isStringMap',
      target: object.constructor,
      propertyName,
      options,
      validator: {
        validate(value: unknown): boolean {
          if (value == null || typeof value !== 'object' || Array.isArray(value)) return false
          const entries = Object.entries(value as Record<string, unknown>)
          if (entries.length === 0 || entries.length > maxKeys) return false
          return entries.every(
            ([k, v]) => typeof k === 'string' && k.length > 0 && typeof v === 'string' && v.length > 0,
          )
        },
        defaultMessage(): string {
          return `${propertyName} must be a map of non-empty strings (≤${maxKeys} keys)`
        },
      },
    })
  }
}

/** Request body for PATCH /schools/:schoolId/mapping. */
export class MergeMappingDto {
  @IsObject()
  @IsNotEmptyObject()
  @IsStringMap(500)
  entries!: Record<string, string>
}
