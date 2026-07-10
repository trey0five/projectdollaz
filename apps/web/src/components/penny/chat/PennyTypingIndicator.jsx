// PennyTypingIndicator — three gold-gradient dots riding a stagger-bounce in a
// white bubble, matching assistant message styling. Motion gated on motion-safe;
// under reduced motion the dots sit still but remain a labelled status region.
export default function PennyTypingIndicator() {
  return (
    <div className="flex justify-start">
      <div
        role="status"
        aria-label="Penny is thinking"
        className="mr-auto inline-flex items-center gap-1.5 rounded-2xl rounded-bl-md border border-rule/70 bg-white px-3.5 py-2.5 shadow-card"
      >
        <span className="h-2 w-2 rounded-full bg-penny-gradient motion-safe:animate-bounce [animation-delay:-0.32s]" />
        <span className="h-2 w-2 rounded-full bg-penny-gradient motion-safe:animate-bounce [animation-delay:-0.16s]" />
        <span className="h-2 w-2 rounded-full bg-penny-gradient motion-safe:animate-bounce" />
      </div>
    </div>
  )
}
