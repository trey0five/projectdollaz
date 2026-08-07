// ─────────────────────────────────────────────────────────────────────────────
// domainMeta — the WEB-ONLY tokens for the ten accreditation domains (Phase B).
//
// LABELS ARE NOT HERE, DELIBERATELY. Every domain label arrives on the server's
// `domains[].label` (from @finrep/compliance DOMAIN_LABELS), so the grid, the
// snapshot record and any future print page can never drift into two vocabularies.
// This file carries only what the server has no business owning: an icon, and the
// one honest sentence that names what would light a domain that has no operating
// signal bound to it.
//
// DOMAIN_SIGNAL_HINT is the "grey with a reason, not grey with a number" copy. It
// is the whole point of the second indicator on every card: a domain with zero
// signals is not a failure and is not an empty state — it is either something
// KYRO genuinely does not measure (mission, learning growth, technology) or an
// intake/module the school has not turned on yet. Both are said out loud. None of
// these sentences may be softened into a call to action that implies a number is
// coming when it is not.
//
// Unknown key → a neutral fallback icon and NO hint (forward-compatible: an
// eleventh domain shipped by the server renders as an ordinary card rather than
// crashing or inventing copy for itself).
// ─────────────────────────────────────────────────────────────────────────────
import {
  Building2,
  Church,
  CircleDashed,
  Compass,
  Cpu,
  GraduationCap,
  HeartHandshake,
  Landmark,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react'

/**
 * domainKey → an ACCENT HUE, for telling ten cards apart at a glance.
 *
 * IDENTITY, NEVER STATUS. These colours say "this card is Finance"; they say
 * nothing about whether Finance is in trouble. The status vocabulary — the
 * red/amber/green of a band chip — is separate and stays separate, because a
 * grid where the card colour and the risk colour compete teaches a reader to
 * trust neither. So the hue is spent on the icon and a hairline rail, and the
 * status keeps the chip.
 *
 * Ten hues, chosen to stay distinguishable side by side and to sit legibly on
 * the light card surface. Finance takes the brand gold — it is the domain this
 * product is actually about.
 */
export const DOMAIN_HUE = {
  mission_identity: '#7C3AED',
  governance: '#1D4ED8',
  leadership: '#0891B2',
  academic_excellence: '#059669',
  student_services: '#DB2777',
  hr: '#EA580C',
  finance: '#CA8A04',
  facilities: '#57534E',
  technology: '#4F46E5',
  continuous_improvement: '#0D9488',
}

/** Neutral for a domain the server ships that this file has not met yet. */
const FALLBACK_HUE = '#64748B'

export function domainHue(key) {
  return DOMAIN_HUE[key] ?? FALLBACK_HUE
}

/** domainKey → lucide glyph. Order mirrors the frozen DOMAIN_KEYS order. */
export const DOMAIN_ICON = {
  mission_identity: Church,
  governance: Landmark,
  leadership: Compass,
  academic_excellence: GraduationCap,
  student_services: HeartHandshake,
  hr: Users,
  finance: Wallet,
  facilities: Building2,
  technology: Cpu,
  continuous_improvement: TrendingUp,
}

/** Neutral glyph for a domain key this build does not know about. */
export const DOMAIN_ICON_FALLBACK = CircleDashed

/** The glyph for a domain key (never throws, never returns undefined). */
export function domainIcon(domainKey) {
  return DOMAIN_ICON[domainKey] ?? DOMAIN_ICON_FALLBACK
}

/**
 * domainKey → what this domain's OPERATIONAL signals are, said plainly, for a
 * card whose framework COVERS the domain but binds no signal to it.
 *
 * THESE SENTENCES ARE STATEMENTS, NOT PROMISES. The earlier copy read "Lights up
 * with the Governance register" / "Lights up with the HR module", which is false
 * twice over: a school that already licenses Governance is told to go and turn on
 * something they have, and no governance metric exists in the registry at all, so
 * the card promises a number that cannot arrive. What is true is "your standards
 * here aren't bound to any operating number, and here is what KYRO does hold" —
 * so that is what they say. None of them may be softened back into a call to
 * action that implies a number is coming when it is not.
 *
 * NOT used when the domain is UNCOVERED — see DOMAIN_NOT_IN_FRAMEWORK.
 */
export const DOMAIN_SIGNAL_HINT = {
  mission_identity:
    "No operating signals. Mission and Catholic identity are not measured from your ledger — and we won't imply otherwise.",
  governance:
    'No operating signal is bound to these standards. KYRO does not derive a governance metric — governance is evidenced, not measured.',
  leadership: 'No operating signal is bound to these standards.',
  academic_excellence:
    "Not measured. Assessment and learning growth need an LMS or assessment integration KYRO doesn't have.",
  student_services:
    'No operating signal is bound to these standards. Aggregate roster counts are the only student-services figure KYRO holds.',
  hr: 'No operating signal is bound to these standards. KYRO does measure staff FTE, teaching share and student:teacher ratio.',
  finance:
    'No operating signal is bound to these standards. KYRO does measure margin, days cash and cost per pupil.',
  facilities:
    'No operating signal is bound to these standards. KYRO does not yet derive a facilities metric.',
  technology: 'Not tracked in KYRO. Grey with a reason, not grey with a number.',
  continuous_improvement:
    'No operating signal is bound to these standards. KYRO does measure plan readiness and forecast vs budget.',
}

/**
 * The terminal sentence for an UNCOVERED domain. Your accreditor asks nothing
 * here, so nothing can ever be bound here: printing "lights up with…" under
 * "Not in your framework" made the card contradict itself in two adjacent lines.
 */
export const DOMAIN_NOT_IN_FRAMEWORK = 'Not applicable — your framework has no standards here.'

/**
 * Signals exist on these standards but are REPORTED ELSEWHERE, because every
 * contributing standard carries less than half its weight in this domain (MSA-4
 * is finance ½ / facilities ¼ / hr ¼: its metrics are Finance signals). Saying
 * "unlock the HR module" here would be flatly false — the numbers are on screen,
 * one card away.
 */
export function domainPartialSignalNote(count) {
  const n = Number(count) || 0
  return `${n} operating signal${n === 1 ? '' : 's'} touch${n === 1 ? 'es' : ''} these standards, but they carry less than half of each — so ${n === 1 ? 'it is' : 'they are'} reported under the domain that carries most of it.`
}

/** The hint for a domain key, or null when this build has no copy for it. */
export function domainSignalHint(domainKey) {
  return DOMAIN_SIGNAL_HINT[domainKey] ?? null
}
