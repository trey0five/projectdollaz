// ReadDot — a tiny status dot for an inbox message: a filled coral dot when the
// message is unread, an empty ring when read. Purely decorative (the bold subject
// already carries the unread signal), so it's aria-hidden.
export default function ReadDot({ unread }) {
  return (
    <span
      aria-hidden="true"
      className={`mt-1 inline-block h-2 w-2 shrink-0 rounded-full ${
        unread ? 'bg-coral' : 'border border-white/25 bg-transparent'
      }`}
    />
  )
}
