// QuestionGroup — the Charts view groups its cards by the QUESTION they answer
// ("How's the money?", "How do we compare?") rather than a flat grid, so a new
// user reads intent before charts. An uppercase question eyebrow over the cards,
// trailed by a hairline gradient rule that fades out (quiet section rhythm).
export default function QuestionGroup({ title, children }) {
  return (
    <section className="mt-1">
      <h3 className="mb-3 mt-6 flex items-center gap-3 px-0.5 text-[12px] font-bold uppercase tracking-[0.14em] text-slate-400 first:mt-1">
        <span className="shrink-0">{title}</span>
        <span aria-hidden="true" className="h-px min-w-0 flex-1 bg-gradient-to-r from-slate-200 to-transparent" />
      </h3>
      {children}
    </section>
  )
}
