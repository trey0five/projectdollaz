// ─────────────────────────────────────────────────────────────────────────────
// RECOGNITION BADGES — accreditor-level metadata, NEVER frameworks.
//
// NCPSA and ICAISA recognize ACCREDITORS; a school cannot adopt them. WHY the
// badge matters (verified 2026-08-25): TN SBE Policy 3.500 approves "any
// accrediting association recognized by NCPSA" and "any… recognized by ICAISA"
// as Category III agencies; LA R.S. 17:4021's approved list names NIPSA; VA
// Code §22.1-19 recognizes VCPE (an NCPSA state member). So the badge answers a
// head of school's real question — "does my state accept this accreditor?" —
// with the recognition body's own name, never a legal claim of our own.
//
// The VALUES live on the seeded framework rows (`recognitions`, the aliases
// self-heal pattern); the DEFINITIONS live here, closed. NAIS's "approved
// accreditors for NAIS membership" list is a DIFFERENT thing (it includes the
// Cognia divisions) — deliberately NOT a badge here; do not conflate.
// ─────────────────────────────────────────────────────────────────────────────

export interface RecognitionBody {
  code: string
  name: string
  fullName: string
  /** The display sentence, rendered verbatim (tooltip / aria-label). */
  line: string
}

export const RECOGNITION_BODIES: Readonly<Record<string, RecognitionBody>> = {
  ncpsa: {
    code: 'ncpsa',
    name: 'NCPSA',
    fullName: 'National Council for Private School Accreditation',
    line: 'Recognized by the National Council for Private School Accreditation (NCPSA)',
  },
  icaisa: {
    code: 'icaisa',
    name: 'ICAISA',
    fullName: 'International Council Advancing Independent School Accreditation',
    line: 'A full member of the International Council Advancing Independent School Accreditation (ICAISA)',
  },
}

export const RECOGNITION_CODES = Object.keys(RECOGNITION_BODIES)

/** Resolve a framework row's recognition codes; unknown codes drop (fail-soft). */
export function recognitionsFor(codes: readonly string[] | null | undefined): RecognitionBody[] {
  return (codes ?? [])
    .map((c) => RECOGNITION_BODIES[c])
    .filter((r): r is RecognitionBody => r !== undefined)
}
