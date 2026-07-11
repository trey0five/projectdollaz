// QuestionGroup — the Charts view groups its cards by the QUESTION they answer
// ("How's the money?", "How do we compare?") rather than a flat grid, so a new
// user reads intent before charts. An uppercase question eyebrow over the cards.
export default function QuestionGroup({ title, children }) {
  return (
    <section className="mt-1">
      <h3 className="mb-2.5 mt-5 px-0.5 text-[12px] font-semibold uppercase tracking-[0.12em] text-muted first:mt-1">
        {title}
      </h3>
      {children}
    </section>
  )
}
