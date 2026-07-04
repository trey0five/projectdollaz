// LandingFooter — small navy footer: brand, copyright, labeled footer nav.
import { Link } from 'react-router-dom'
import { LineChart } from 'lucide-react'
import { FOOTER } from './landingContent.js'

const FOCUS_RING = 'outline-none focus-visible:ring-2 focus-visible:ring-gold/60'

export default function LandingFooter() {
  return (
    <footer className="border-t border-white/10 bg-navy-deep py-10">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 px-5 sm:flex-row sm:px-8">
        <Link
          to="/"
          aria-label="Project Dollaz — home"
          className={`flex items-center gap-2.5 rounded-lg px-1 py-1 transition-opacity hover:opacity-90 ${FOCUS_RING}`}
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gold-gradient text-navy-deep">
            <LineChart size={15} />
          </span>
          <span className="font-serif text-[15px] font-semibold text-gold-light">
            Project Dollaz
          </span>
        </Link>
        <p className="text-[13px] text-white/60">{FOOTER.copyright}</p>
        <nav aria-label="Footer" className="flex items-center gap-6">
          {FOOTER.links.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className={`rounded-md text-[13px] font-semibold text-white/70 transition-colors hover:text-gold-light ${FOCUS_RING}`}
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  )
}
