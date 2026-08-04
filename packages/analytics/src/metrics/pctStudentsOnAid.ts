import type { MetricDef } from '../types.js'

/**
 * Both aid inputs are present, but there are more students on aid than there are
 * students. Namespaced like 'scope:not-aggregatable' — a present input that cannot
 * be used, not a missing one — so a consumer can tell the two apart and say
 * something true about which.
 */
export const INCONSISTENT_AID_VS_ENROLLMENT = 'inconsistent:aid-exceeds-enrollment'

/**
 * % of students on aid = students on aid ÷ enrollment. 0..1.
 * Contextual (neutral). Requires studentsOnAid present (0 is valid -> 0%) and
 * enrollment > 0. Missing inputs named precisely; never a fabricated zero.
 */
export const pctStudentsOnAid: MetricDef = {
  key: 'pct_students_on_aid',
  label: '% of Students on Aid',
  unit: 'percent',
  category: 'operational',
  goodDirection: 'neutral',
  domain: 'aid',
  // Org = ΣstudentsOnAid / Σenrollment — enrollment-weighted share.
  scopeAggregation: 'recompute-from-components',
  inputs: [
    { key: 'studentsOnAid', source: 'operational', label: 'Students on aid' },
    { key: 'enrollment', source: 'operational', label: 'Enrollment' },
  ],
  basis: 'Students receiving aid ÷ enrollment.',
  formula: 'Students on aid ÷ Enrollment',
  description: 'Share of the student body receiving financial aid.',
  compute(_cur, _prior, curOp) {
    const missing: string[] = []
    const studentsOnAid = curOp?.studentsOnAid ?? null
    const enrollment = curOp?.enrollment ?? null
    if (studentsOnAid === null) missing.push('studentsOnAid')
    if (enrollment === null || enrollment <= 0) missing.push('enrollment')
    const inputs = [
      { key: 'studentsOnAid', label: 'Students on aid', value: studentsOnAid, unit: 'ratio' as const },
      { key: 'enrollment', label: 'Enrollment', value: enrollment, unit: 'ratio' as const },
    ]
    if (missing.length > 0 || studentsOnAid === null || enrollment === null) {
      return { value: null, available: false, inputsMissing: missing, inputs }
    }
    // BOTH INPUTS ARE PRESENT AND THE ANSWER IS STILL IMPOSSIBLE.
    //
    // The two numbers come from different places: `studentsOnAid` is typed by a
    // human, `enrollment` can be replaced wholesale by a roster upload. Type 600
    // against an enrollment of 1200 (a sensible 50%) and then let a roster set
    // enrollment to 436, and nothing moves the 600 — this metric then computed
    // 1.38 and the dashboard rendered "138.0% of students on aid". A school cannot
    // have more students on aid than it has students, and the doc line above this
    // function has always said 0..1; nothing enforced it.
    //
    // REFUSED, not clamped. Capping at 100% would replace an obviously-broken
    // figure with a plausible-looking wrong one, nobody would investigate, and a
    // school where every student genuinely is on aid would be indistinguishable
    // from one with stale data. An impossible input pair is a fact about the
    // INPUTS, so it is reported the same way every other unusable input is —
    // available:false with a named reason — not smoothed into a believable number.
    //
    // The token is namespaced like the existing 'scope:not-aggregatable': it is
    // not a MISSING input, it is a present one that cannot be used.
    if (studentsOnAid > enrollment) {
      return {
        value: null,
        available: false,
        inputsMissing: [INCONSISTENT_AID_VS_ENROLLMENT],
        inputs,
      }
    }
    return {
      value: studentsOnAid / enrollment,
      available: true,
      inputsMissing: [],
      inputs,
    }
  },
}
