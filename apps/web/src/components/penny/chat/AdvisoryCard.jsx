// AdvisoryCard — the Mode-B / Mode-C advisory answer Penny streams as a CARD
// rather than as chat prose (AIC Phase J §8).
//
// WHY A CARD. The guarded text is what the user must READ. Relaying it through
// the outer chat model would put an unguarded paraphrase between the server's
// per-segment number guard and the reader, which is the exact failure this phase
// exists to prevent. `render_chart` set the precedent: the server owns the
// artifact, the chat model owns one digit-free sentence of introduction.
//
// THE ONE RULE, at the surface: this component ORIGINATES NOTHING. Every sentence
// on screen is `segment.text` verbatim; every figure is one the server put in a
// segment, in the title, or in the two counts the payload itself carries
// (`templateFallbackCount` and the number of segments). There is no branch here
// that formats, rounds, re-derives, re-orders or markdown-transforms a value.
//
// THREE THINGS THIS FILE GUARANTEES, each pinned RED in AdvisoryCard.spec.jsx:
//   1. A Mode-B/C answer is VISIBLY a phrased one. The provenance strip says a
//      language model rephrased these sentences — so a reader can tell this card
//      apart from the Mode-A DraftImprovementPlanCard, which says the opposite.
//   2. A `source:'template'` segment is NOT flagged as inferior. It is the MORE
//      trustworthy one: it is KYRO's own wording. Both sources render through the
//      identical body class; only a neutral provenance chip differs.
//   3. A card with nothing to say READS AS A REFUSAL — reason plus next step —
//      never as an empty or broken panel.
//
// Theme: token colours only (`navy`/`ink`/`muted`/`rule`/`penny`), which is how
// this app themes. There is no tailwind `darkMode` here — the light/dark and
// v1/v2 variance is the CSS-var token swap (src/styles/tokens.css), which these
// classes follow automatically. Motion is gated on `useReducedMotion`.
import { motion, useReducedMotion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { AlertTriangle, BadgeCheck, FlaskConical, Info, ScrollText, Sparkles } from 'lucide-react'

/** Server-composed title is authoritative; these are the fallbacks when it is absent. */
export const TOOL_TITLES = {
  explain_readiness_change: 'What moved, and why',
  generate_readiness_narrative: 'Where readiness stands',
}

export const MODE_META = {
  B: { eyebrow: 'Root-cause explanation', Icon: FlaskConical },
  C: { eyebrow: 'Readiness narrative', Icon: ScrollText },
}

/**
 * The provenance strip. This is the sentence that makes a Mode-B/C card
 * distinguishable from a Mode-A plan at a glance — and it is deliberately about
 * what the model was NOT allowed to do.
 */
export const PROVENANCE_LINE =
  'Every figure below was computed by KYRO. A language model was allowed to rephrase these sentences and nothing else — any sentence carrying a figure KYRO had not computed was thrown away and KYRO’s own wording used instead.'

/**
 * THE OTHER PROVENANCE LINE, for the turns on which NO MODEL WAS CALLED AT ALL:
 * the cannot-attribute branch, and any deployment with no LLM configured. Printing
 * PROVENANCE_LINE there told the reader a language model had rephrased sentences
 * that a language model had never seen — a false statement about provenance on the
 * one surface whose entire job is letting a reader tell computed fact from phrasing.
 */
export const NO_MODEL_PROVENANCE_LINE =
  'Every sentence below was composed by KYRO from computed values. No language model was called on this answer at all.'

/**
 * Per-segment provenance. Neither label is pejorative and neither is superlative:
 * "KYRO’s words" is the deterministic one and is, if anything, the safer of the
 * two. Rendering it as a downgrade (greyed, italicised, "fallback", "unavailable")
 * would teach a reader to distrust exactly the sentences they can trust most.
 */
export const SOURCE_META = {
  template: {
    label: 'KYRO’s words',
    hint: 'Composed by KYRO from computed values. No model wrote this sentence.',
  },
  llm: {
    label: 'Rephrased',
    hint: 'Rephrased by a language model. Every figure in it was checked against KYRO’s own values.',
  },
}

/**
 * ONE class string for the segment body, used for BOTH sources. Extracted to a
 * constant so "template segments are not styled as inferior" is a property the
 * spec can assert rather than a convention a future diff can quietly drop.
 */
export const SEGMENT_BODY_CLASS =
  'mt-1 whitespace-pre-wrap text-[14.5px] leading-relaxed text-ink'

const isNonEmptyString = (v) => typeof v === 'string' && v.trim().length > 0

function SourceChip({ source }) {
  const meta = SOURCE_META[source] || SOURCE_META.template
  return (
    <span
      data-testid={`segment-source-${source === 'llm' ? 'llm' : 'template'}`}
      title={meta.hint}
      className="inline-flex shrink-0 items-center gap-1 rounded-md border border-navy/15 bg-white px-1.5 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.08em] text-navy/60"
    >
      {source === 'llm' ? <Sparkles size={10} aria-hidden /> : <BadgeCheck size={10} aria-hidden />}
      {meta.label}
    </span>
  )
}

export default function AdvisoryCard({ card }) {
  const reduce = useReducedMotion()
  const payload = card || {}
  const mode = payload.mode === 'B' || payload.mode === 'C' ? payload.mode : null
  const meta = MODE_META[mode] || MODE_META.C
  const ModeIcon = meta.Icon
  const title = isNonEmptyString(payload.title)
    ? payload.title
    : TOOL_TITLES[payload.tool] || meta.eyebrow
  const disclaimer = isNonEmptyString(payload.disclaimer) ? payload.disclaimer : null
  const segments = (Array.isArray(payload.segments) ? payload.segments : []).filter(
    (s) =>
      s &&
      isNonEmptyString(s.text) &&
      // THE DISCLAIMER IS NOT A FINDING. It renders once, in its own always-visible
      // slot below. It arrived as a body segment too for a while, so it appeared as
      // the last numbered item — carrying a "KYRO’s words" provenance chip, as though
      // 40 words of legal text were something the register had computed — and again
      // immediately underneath. Dropping it here also keeps it out of any count.
      !(disclaimer && s.text.trim() === disclaimer.trim()),
  )
  const cannotAttribute = payload.cannotAttribute === true
  const fallbackCount =
    Number.isFinite(payload.templateFallbackCount) && payload.templateFallbackCount >= 0
      ? Math.trunc(payload.templateFallbackCount)
      : null
  // Did a language model actually get asked? Explicit on the payload — NOT inferred
  // from `source`, because "the model spoke and every sentence was thrown away" and
  // "nothing was asked" are different facts and the card must not merge them.
  const modelCalled = payload.modelCalled !== false
  // THE TALLY'S DENOMINATOR IS SERVER-SENT. It is the number of segments actually
  // submitted to the composer, which is NOT `segments.length`: the server may render
  // a segment the composer never saw, and counting it made the card report that one
  // sentence had been accepted from a model on a turn where none had.
  const checkedCount = Number.isFinite(payload.checkedSegmentCount)
    ? Math.trunc(payload.checkedSegmentCount)
    : segments.length

  return (
    <motion.section
      data-testid="advisory-card"
      data-mode={mode || 'unknown'}
      aria-label={title}
      initial={reduce ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reduce ? { duration: 0 } : { duration: 0.24, ease: 'easeOut' }}
      className="mt-2 overflow-hidden rounded-xl border border-navy/15 bg-section/70 p-2.5 shadow-card"
    >
      <header>
        <p className="flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-[0.1em] text-navy/70">
          <ModeIcon size={13} aria-hidden />
          {meta.eyebrow}
          {payload.demoData ? (
            <span
              data-testid="advisory-demo"
              className="ml-1 rounded-md border border-penny/40 bg-penny/10 px-1.5 py-px text-[10.5px] font-bold uppercase tracking-[0.08em] text-[#7a5e00]"
            >
              Demo data
            </span>
          ) : null}
        </p>
        <h4 className="mt-0.5 font-serif text-[18px] font-semibold leading-tight text-navy">
          {title}
        </h4>
      </header>

      {/* The Mode declaration, in words. This is what a reader compares against
          the Mode-A plan card's "no language model" line. */}
      <p
        data-testid="advisory-provenance"
        className="mt-1.5 flex items-start gap-1.5 rounded-lg border border-navy/10 bg-white/70 px-2 py-1.5 text-[11.5px] leading-snug text-navy/70"
      >
        <Info size={12} aria-hidden className="mt-px shrink-0" />
        <span>{modelCalled ? PROVENANCE_LINE : NO_MODEL_PROVENANCE_LINE}</span>
      </p>

      {cannotAttribute ? (
        <p
          data-testid="advisory-cannot-attribute"
          className="mt-2 flex items-start gap-1.5 rounded-lg border border-navy/15 bg-white/80 px-2 py-1.5 text-[12px] font-semibold leading-snug text-navy/80"
        >
          <AlertTriangle size={13} aria-hidden className="mt-px shrink-0" />
          <span>
            KYRO could not attribute this change to anything in the register. Nothing has been
            guessed to fill the gap — what follows is only what the register can support.
          </span>
        </p>
      ) : null}

      {segments.length > 0 ? (
        <ol data-testid="advisory-segments" className="mt-2 space-y-2">
          {segments.map((seg, i) => (
            <li
              key={`${seg.id ?? 'seg'}:${i}`}
              data-testid="advisory-segment"
              data-segment-id={seg.id ?? ''}
              data-source={seg.source === 'llm' ? 'llm' : 'template'}
              className="rounded-lg border border-navy/10 bg-white/70 px-2.5 py-2"
            >
              <SourceChip source={seg.source} />
              {/* VERBATIM. Not markdown-rendered, not truncated, not re-wrapped:
                  the server guarded this exact string. */}
              <p data-testid="advisory-segment-body" className={SEGMENT_BODY_CLASS}>
                {seg.text}
              </p>
            </li>
          ))}
        </ol>
      ) : (
        // A card with nothing renderable is a DEFECT, and it says so with a next
        // step. An empty panel is the one outcome that reads as "Penny had an
        // answer and the screen ate it".
        <div
          role="alert"
          data-testid="advisory-empty"
          className="mt-2 rounded-lg border border-danger/30 bg-danger/[0.06] px-2.5 py-2 text-[13px] leading-snug text-danger"
        >
          <p className="font-semibold">There is nothing here to show.</p>
          <p className="mt-0.5 text-navy/70">
            KYRO returned no sentences for this answer, and nothing has been written to fill the
            gap. Ask again, or read the underlying figures on the readiness page.
          </p>
          <Link
            to="/accreditation"
            className="mt-1 inline-block text-[13px] font-semibold text-navy underline hover:no-underline"
          >
            Open Accreditation readiness
          </Link>
        </div>
      )}

      {/* "The model was ignored 4 times out of 5" is on the payload precisely so
          it can be VISIBLE rather than silent (§2.3). Both counts come from the
          payload; neither is derived into a rate or a percentage. */}
      {fallbackCount != null && segments.length > 0 ? (
        <p data-testid="advisory-fallbacks" className="mt-2 text-[11.5px] leading-snug text-muted">
          {!modelCalled
            ? `KYRO wrote every one of these ${segments.length} sentences. No language model was asked, so nothing was rejected from one.`
            : fallbackCount === 0
              ? `Every one of these ${checkedCount} sentences passed KYRO’s figure check.`
              : `${fallbackCount} of these ${checkedCount} sentences were not accepted from the model; KYRO’s own wording is shown for those.`}
        </p>
      ) : null}

      {/* A NEXT STEP on the branch that actually renders. The refusal branch above
          has always offered one; every reachable success path offered none, so a head
          of school read "COG-1.1 fell from 3 to 2 on the rubric" with nothing to
          click. This link ORIGINATES nothing — it is a fixed route to the register
          the segments were computed from, never a target synthesised from segment
          text. */}
      {segments.length > 0 ? (
        <p className="mt-2">
          <Link
            data-testid="advisory-next-step"
            to="/accreditation"
            className="text-[13px] font-semibold text-navy underline hover:no-underline"
          >
            Open Accreditation readiness
          </Link>
        </p>
      ) : null}

      {disclaimer ? (
        // Always rendered, never behind a disclosure. A disclaimer a reader has to
        // open is a disclaimer most readers never see.
        <p
          data-testid="advisory-disclaimer"
          className="mt-2 border-t border-navy/10 pt-1.5 text-[11px] leading-relaxed text-muted"
        >
          {disclaimer}
        </p>
      ) : null}
    </motion.section>
  )
}
