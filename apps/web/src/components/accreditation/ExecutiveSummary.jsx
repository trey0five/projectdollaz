// ─────────────────────────────────────────────────────────────────────────────
// ExecutiveSummary — SEAM B. The ONE component that renders the six executive
// summary segments, on every surface that shows them (AIC Phase H §2.5).
//
// It renders one <p> per segment, `text` VERBATIM, in payload order, and nothing
// else inside the compared region. No heading is interleaved into the segment
// paragraphs, no segment is dropped, none is merged, none is truncated with an
// ellipsis, and there is no "read more". The optional `title` renders as an <h3>
// OUTSIDE the paragraph set precisely so it cannot leak into the acceptance-3
// comparison — and `summaryDomText` compares EVERY <p> inside this section, not
// just the ones carrying `data-summary-segment`, so an added paragraph cannot
// evade the comparison by declining to tag itself.
//
// THIS COMPONENT COMPOSES NO SENTENCE. There is no string literal below that a
// reader ever sees except the heading a caller explicitly passes in. If a future
// change adds one, `visit-print.spec.jsx` (SPEC-WEB-4) goes red, because the
// printed DOM will no longer equal `summarySpeech(segments)`.
//
// The `print` variant is a typography switch only — the same nodes, the same
// text, the same count. Print surfaces are deliberately excluded from the app's
// typography overrides (see the repo's print reset); nothing here fights that.
// ─────────────────────────────────────────────────────────────────────────────
import { SUMMARY_SEGMENT_ATTR, SUMMARY_TESTID } from './visitSummary.js'

export default function ExecutiveSummary({
  segments = [],
  /** Rendered ABOVE the segments, outside the compared region. Default: none. */
  title = null,
  /** 'screen' | 'print' — typography only. Never changes what text is rendered. */
  variant = 'screen',
  className = '',
}) {
  const list = Array.isArray(segments) ? segments : []
  const print = variant === 'print'
  return (
    <section
      className={className}
      aria-label={typeof title === 'string' && title ? title : 'Executive summary'}
      data-testid={SUMMARY_TESTID}
    >
      {title ? (
        <h3
          className={
            print
              ? 'mb-1.5 text-[12px] font-bold uppercase tracking-[0.1em]'
              : 'mb-2 font-serif text-[16px] font-semibold text-navy'
          }
        >
          {title}
        </h3>
      ) : null}
      <div className={print ? 'space-y-1.5' : 'space-y-2'}>
        {list.map((segment, i) => (
          <p
            // `key` is the segment key when the composer supplies one; the index is
            // the fallback so a payload that somehow repeats a key still renders
            // every sentence rather than collapsing two into one.
            key={segment?.key ? `${segment.key}-${i}` : `segment-${i}`}
            {...{ [SUMMARY_SEGMENT_ATTR]: segment?.key ?? String(i) }}
            className={
              print
                ? 'text-[11.5px] leading-[1.5]'
                : 'text-[13.5px] leading-relaxed text-muted'
            }
          >
            {segment?.text ?? ''}
          </p>
        ))}
      </div>
    </section>
  )
}
