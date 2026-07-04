// StudioCapabilityTiles — the "Get something done" grid. Each tile either prefills
// the ask bar or sends straight into a conversation (handled by the parent via
// onSelect). Dark command-deck cards with a gold sheen sweep + gold hover edge.
import { ArrowRight } from 'lucide-react'
import { STUDIO_TILES } from './studioTiles.js'

export default function StudioCapabilityTiles({ onSelect, canEdit = false }) {
  const tiles = STUDIO_TILES.filter((t) => !t.ownerOnly || canEdit)

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="font-serif text-[22px] font-semibold text-white">Get something done</h2>
        <span className="text-[13.5px] text-[#93a6c4]">
          One tap — Penny does the work and shows you the result to approve.
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onSelect(t)}
            className="group relative overflow-hidden rounded-2xl border border-[#22406e] bg-[#152a4d] p-[18px] text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-gold/60 hover:shadow-glow focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/60 motion-reduce:hover:translate-y-0"
          >
            {/* Gold sheen sweep on hover */}
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 -translate-x-[130%] bg-gradient-to-r from-transparent via-gold/15 to-transparent transition-transform duration-700 ease-out group-hover:translate-x-[130%] motion-reduce:hidden"
            />
            <span className="relative mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-gold/15 text-gold-light">
              <t.Icon size={20} aria-hidden />
            </span>
            <h3 className="relative text-[15.5px] font-bold text-white">{t.title}</h3>
            <p className="relative mt-1 text-[13px] leading-relaxed text-[#93a6c4]">{t.blurb}</p>
            <span className="relative mt-3 inline-flex items-center gap-1.5 text-[12.5px] font-bold text-gold-light">
              {t.cta}
              <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
            </span>
          </button>
        ))}
      </div>
    </section>
  )
}
