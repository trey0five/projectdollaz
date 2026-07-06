// ─────────────────────────────────────────────────────────────────────────────
// OneRoster grade-code → analytics GradeKey mapping.
//
// OneRoster (and the underlying US ED `grades` code set it borrows) uses codes
// like IT/PR/PK/TK/KG/01..12. The driver model's GradeKey union is PK3/PK4/K/1..12,
// so we collapse the early-childhood codes into the two PreK bands the tuition
// model understands (PK3 = 3-year-old / part-time, PK4 = 4-year-old / full-day)
// and strip the leading zero off the numeric grades. Both zero-padded ('01') and
// bare ('1') numerics are accepted because exporters differ. A code NOT in this
// map is an "unknown grade" — the parser counts it in `raw` and warns, but never
// puts it in byGrade/totalEnrolled (better to under-count knowns than invent a grade).
// ─────────────────────────────────────────────────────────────────────────────
import type { GradeKey } from '@finrep/analytics'

export const ONEROSTER_GRADE_MAP: Record<string, GradeKey> = {
  // Early childhood → the two PreK bands.
  IT: 'PK3', // infant/toddler
  PR: 'PK3', // preschool (3s)
  PK: 'PK4', // prekindergarten (4s / VPK)
  TK: 'PK4', // transitional kindergarten
  KG: 'K',
  K: 'K',
  // Zero-padded numerics (OneRoster canonical).
  '01': '1',
  '02': '2',
  '03': '3',
  '04': '4',
  '05': '5',
  '06': '6',
  '07': '7',
  '08': '8',
  '09': '9',
  '10': '10',
  '11': '11',
  '12': '12',
  // Bare numerics (tolerated).
  '1': '1',
  '2': '2',
  '3': '3',
  '4': '4',
  '5': '5',
  '6': '6',
  '7': '7',
  '8': '8',
  '9': '9',
}
