// ─────────────────────────────────────────────────────────────────────────────
// EVIDENCE PLATFORMS — accreditor-level metadata, NEVER frameworks, never a
// connector. Some accreditors run the whole cycle (annual report, self-study,
// visit) through a third-party portal, and a head of school's real question is
// "where do I actually file this?" The answer belongs beside the accreditor's
// name; it is NOT a claim that KYRO submits anything there.
//
// Same shape and discipline as recognitions.ts: the VALUES are keyed by seeded
// framework code, the DEFINITIONS live here, closed, and resolve at read time
// into `FrameworkPublic.evidencePlatform` (no migration, no seed column). An
// absent key means "no separate portal we have verified", never "unknown".
//
// fccap — verified in a browser 2026-09-10:
//   · eas-ed.org/accreditation-program (the program's own site): "Accreditrac,
//     LLC created a dynamic platform that is used by schools' faculty and staff,
//     superintendents, visiting teams, and the FCC accreditation staff at every
//     level of the process."
//   · eas-ed2.accreditrac.com/login.php: "Welcome to the Florida Catholic
//     Conference Accreditation Program Accreditrac Portal!"
//   · accreditrac.com (Accreditrac, LLC): annual reporting + self-study, site
//     visit management, action plan / progress reporting modules.
// The product is spelled "Accreditrac" (no k). "AccrediTrack" is how it is
// commonly said aloud, so it is kept as a framework ALIAS for search — the
// display name is the vendor's own spelling. (accreditrack.com, with a k, is
// an unrelated employee-licence tracker; never link it.)
// ─────────────────────────────────────────────────────────────────────────────

export interface EvidencePlatform {
  /** The vendor's own spelling, rendered verbatim. */
  name: string
  /** The display sentence, rendered verbatim (tooltip / aria-label / modal). */
  line: string
}

export const EVIDENCE_PLATFORMS: Readonly<Record<string, EvidencePlatform>> = {
  fccap: {
    name: 'Accreditrac',
    line:
      'The annual report, the self-study, evidence and the visitation are filed in the Florida Catholic Conference’s Accreditrac portal. KYRO organises what you will upload there; it does not submit on your behalf.',
  },
}

export const EVIDENCE_PLATFORM_CODES = Object.keys(EVIDENCE_PLATFORMS)

/** Resolve a framework code's evidence platform; unknown → null (fail-soft). */
export function evidencePlatformFor(frameworkCode: string | null | undefined): EvidencePlatform | null {
  if (!frameworkCode) return null
  return EVIDENCE_PLATFORMS[frameworkCode] ?? null
}
