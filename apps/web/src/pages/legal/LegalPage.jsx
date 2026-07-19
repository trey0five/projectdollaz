// LegalPage — a clean, readable layout for the public Terms / Privacy pages: a
// simple KYRO header, a centered reading column on a light surface, and a minimal
// footer with the copyright + legal links. Deliberately plain (not the navy
// marketing chrome) so long-form legal text stays legible.
import { Link } from 'react-router-dom'
import { FOOTER } from '../landing/landingContent.js'

const FOCUS = 'outline-none focus-visible:ring-2 focus-visible:ring-gold/50'

// Shared content elements (no prose plugin in this project).
export const H2 = ({ children }) => (
  <h2 className="mt-9 mb-2 font-serif text-[20px] font-semibold text-navy">{children}</h2>
)
export const P = ({ children }) => (
  <p className="mb-3 text-[15px] leading-relaxed text-ink/90">{children}</p>
)
export const UL = ({ children }) => (
  <ul className="mb-3 list-disc space-y-1.5 pl-6 text-[15px] leading-relaxed text-ink/90">{children}</ul>
)

export default function LegalPage({ title, updated, children }) {
  return (
    <div className="flex min-h-screen flex-col bg-[#faf8f4] text-navy">
      <header className="border-b border-navy/10 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-4 sm:px-8">
          <Link to="/" aria-label="KYRO — home" className={`flex items-center gap-2.5 rounded-lg ${FOCUS}`}>
            <img src="/kyro-mark.png" alt="" className="h-8 w-8 object-contain" />
            <span className="font-serif text-[16px] font-semibold text-navy">KYRO</span>
          </Link>
          <Link to="/" className={`rounded-md text-[13px] font-semibold text-muted hover:text-navy ${FOCUS}`}>
            ← Back to home
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-12 sm:px-8">
        <h1 className="font-serif text-[30px] font-bold leading-tight text-navy">{title}</h1>
        {updated && <p className="mt-1.5 text-[13px] text-muted">Last updated {updated}</p>}
        <div className="mt-8">{children}</div>
      </main>

      <footer className="border-t border-navy/10 bg-white py-8">
        <div className="mx-auto flex max-w-3xl flex-col items-center justify-between gap-3 px-5 sm:flex-row sm:px-8">
          <p className="text-[13px] text-muted">{FOOTER.copyright}</p>
          <nav aria-label="Legal" className="flex gap-5 text-[13px] font-semibold text-muted">
            <Link to="/terms" className={`hover:text-navy ${FOCUS}`}>Terms</Link>
            <Link to="/privacy" className={`hover:text-navy ${FOCUS}`}>Privacy</Link>
            <Link to="/login" className={`hover:text-navy ${FOCUS}`}>Sign in</Link>
          </nav>
        </div>
      </footer>
    </div>
  )
}
