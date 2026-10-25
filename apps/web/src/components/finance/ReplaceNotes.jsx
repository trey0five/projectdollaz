// ReplaceNotes — the line under a sorted file that says, BEFORE anything is
// saved, what it will replace ("Replaces your FY25 trial balance (uploaded
// Oct 3)") or where it fits ("Goes with your saved FY25 Profit and Loss…").
// Notes come from lib/financeInventory.routeVerdict.
export default function ReplaceNotes({ notes }) {
  if (!notes?.length) return null
  return (
    <>
      {notes.map((n) => (
        <p
          key={n.text}
          data-testid="replace-note"
          data-tone={n.tone}
          className={`mt-1 text-[12.5px] font-medium ${
            n.tone === 'watch' ? 'text-[rgb(var(--c-watch))]' : 'text-[rgb(var(--c-module))]'
          }`}
        >
          {n.text}
        </p>
      ))}
    </>
  )
}
