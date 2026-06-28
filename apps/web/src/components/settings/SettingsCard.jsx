// Shared cream sub-card for settings sections: a titled, bordered panel that
// matches the navy/gold aesthetic used across the app.
export default function SettingsCard({ title, description, children, action }) {
  return (
    <section className="mb-6 rounded-2xl border border-border bg-white px-5 py-6 shadow-sm sm:px-7">
      {(title || action) && (
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            {title && (
              <h2 className="font-serif text-[20px] font-semibold leading-tight text-navy">
                {title}
              </h2>
            )}
            {description && <p className="mt-1 text-[15px] text-muted">{description}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  )
}
