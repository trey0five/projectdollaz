// ─────────────────────────────────────────────────────────────────────────────
// WS1 — ACCREDITOR DIVISIONS (the NCA CASI ask), a closed TS constant.
//
// Verified fact (research brief A1, binding): NCA CASI, SACS CASI and NWAC are
// live named "Accreditation Divisions" of Cognia — one policy document, ONE
// standards set, one Cognia Global Commission. They are NEVER a second catalog;
// they are metadata on the ONE Cognia framework. "AdvancED" is the predecessor
// ORGANIZATION, not a live division — it lives in the framework's aliases so a
// school searching it still finds Cognia, and it never appears in this picker.
//
// The SEAL LINE is composed HERE and only here (server-side), then rendered
// verbatim by the hero, the visit print header, the board one-pager and Penny —
// the Penny-narrates value-validated discipline applied to a sentence. Per the
// 2023 seal guidelines there is ONE Cognia-branded seal image and we render no
// accreditor logos anywhere, so "seal" in this program is the LINE, not an
// image asset.
// ─────────────────────────────────────────────────────────────────────────────

export interface AccreditorDivision {
  code: string
  name: string
  fullName: string
  sealLine: string
}

export const COGNIA_DIVISIONS: readonly AccreditorDivision[] = [
  {
    code: 'nca_casi',
    name: 'NCA CASI',
    fullName:
      'North Central Association Commission on Accreditation and School Improvement',
    sealLine: 'Accredited by NCA CASI, an accreditation division of Cognia',
  },
  {
    code: 'sacs_casi',
    name: 'SACS CASI',
    fullName:
      'Southern Association of Colleges and Schools Council on Accreditation and School Improvement',
    sealLine: 'Accredited by SACS CASI, an accreditation division of Cognia',
  },
  {
    code: 'nwac',
    name: 'NWAC',
    fullName: 'Northwest Accreditation Commission',
    sealLine: 'Accredited by NWAC, an accreditation division of Cognia',
  },
] as const

/** For the DTO @IsIn (house rule: TEXT + @IsIn, never a PG enum). */
export const DIVISION_CODES = COGNIA_DIVISIONS.map((d) => d.code)

/** frameworkCode → the divisions its accreditor operates ([] for everyone else). */
export const FRAMEWORK_DIVISIONS: Readonly<Record<string, readonly AccreditorDivision[]>> = {
  cognia_2022: COGNIA_DIVISIONS,
  cognia_2025: COGNIA_DIVISIONS,
}

/** The divisions available on a framework; [] for frameworks with none. */
export function divisionsFor(frameworkCode: string): readonly AccreditorDivision[] {
  return FRAMEWORK_DIVISIONS[frameworkCode] ?? []
}

/**
 * The server-composed display line for a school's division choice, or null when
 * no (valid) division is set. A dangling/unknown code reads as "no division" —
 * fail-soft, the same discipline as a dangling supersededByCode.
 */
export function sealLineFor(
  frameworkCode: string,
  divisionCode: string | null | undefined,
): string | null {
  if (!divisionCode) return null
  const division = divisionsFor(frameworkCode).find((d) => d.code === divisionCode)
  return division?.sealLine ?? null
}

/** The division row itself (name/fullName/sealLine), or null. Same fail-soft rule. */
export function divisionFor(
  frameworkCode: string,
  divisionCode: string | null | undefined,
): AccreditorDivision | null {
  if (!divisionCode) return null
  return divisionsFor(frameworkCode).find((d) => d.code === divisionCode) ?? null
}
