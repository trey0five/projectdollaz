// Shared settings section shell (see the note above the component).
// Premium UI P4: a settings section is a form → the one raised surface, a
// Panel (hairline, 1px contact shadow, 8px), titled in ink with the description
// under it; the optional action sits at the right of the head.
export default function SettingsCard({ title, description, children, action }) {
  return (
    <section className="panel mb-6 px-5 py-5 sm:px-6">
      {(title || action) && (
        <div className="mb-5 flex flex-wrap items-start justify-between gap-4 border-b border-hair pb-4">
          <div className="min-w-0">
            {title && <h2 className="text-heading font-semibold text-ink">{title}</h2>}
            {description && <p className="mt-1 max-w-2xl text-small text-ink2">{description}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  )
}
