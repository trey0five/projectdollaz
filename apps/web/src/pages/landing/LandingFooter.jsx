// LandingFooter — the page's foot on the ground: a hairline, the KYRO mark +
// set wordmark, copyright and the labeled footer nav. (The page's one ink band
// is the hero; the footer no longer adds a second.)
import { Link } from 'react-router-dom'
import { FOOTER } from './landingContent.js'

const FOCUS_RING = 'outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]/50 focus-visible:ring-offset-2'

export default function LandingFooter() {
  return (
    <footer className="border-t border-hair py-8">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-5 px-5 sm:flex-row sm:px-8">
        <Link to="/" aria-label="KYRO — home" className={`flex items-center gap-2 rounded-sm py-1 ${FOCUS_RING}`}>
          <img src="/kyro-mark.png" alt="" width="40" height="40" loading="lazy" className="h-10 w-10 shrink-0 scale-[1.35] object-contain" />
          <span className="text-[15px] font-semibold tracking-[0.32em] text-ink">KYRO</span>
        </Link>
        <p className="text-[13px] text-ink2">{FOOTER.copyright}</p>
        <nav aria-label="Footer" className="flex items-center gap-6">
          {FOOTER.links.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className={`rounded-sm text-[13px] font-semibold text-ink2 transition-colors hover:text-ink ${FOCUS_RING}`}
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  )
}
