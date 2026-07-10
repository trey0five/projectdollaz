// StudioRecipes — the "Guided workflows" landing section. Curated multi-step
// routines Penny runs end to end via her existing tools. Reuses the light
// StudioCapabilityTiles card idiom (card-soft, gold-gradient icon chip, hover lift
// + gold sheen, focus-visible gold ring) and adds a subtle numbered step list.
// Clicking a card (or its CTA) calls onRun(recipe.prompt), which enters a
// conversation through the normal chat.send path.
import { ArrowRight } from 'lucide-react'
import { STUDIO_RECIPES } from './studioRecipes.js'

export default function StudioRecipes({ onRun }) {
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="font-serif text-[22px] font-semibold text-navy">Guided workflows</h2>
        <span className="text-[13.5px] text-muted">
          Multi-step routines Penny runs for you, start to finish.
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
        {STUDIO_RECIPES.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => onRun(r.prompt)}
            className="card-soft group relative flex flex-col overflow-hidden p-[18px] text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-penny/50 hover:shadow-penny-glow focus:outline-none focus-visible:ring-2 focus-visible:ring-penny/60 motion-reduce:hover:translate-y-0"
          >
            {/* Gold sheen sweep on hover */}
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 -translate-x-[130%] bg-gradient-to-r from-transparent via-penny/15 to-transparent transition-transform duration-700 ease-out group-hover:translate-x-[130%] motion-reduce:hidden"
            />
            <span className="relative mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-penny-gradient text-navy shadow-penny-glow">
              <r.Icon size={20} aria-hidden />
            </span>
            <h3 className="relative text-[15.5px] font-bold text-navy">{r.title}</h3>
            <p className="relative mt-1 text-[13px] leading-relaxed text-muted">{r.description}</p>

            {/* Numbered step preview */}
            <ol className="relative mt-3 space-y-1.5">
              {r.steps.map((step, i) => (
                <li key={i} className="flex items-start gap-2 text-[12.5px] leading-snug text-muted">
                  <span className="mt-px flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-penny/15 text-[10px] font-bold text-penny">
                    {i + 1}
                  </span>
                  {step}
                </li>
              ))}
            </ol>

            <span className="relative mt-3.5 inline-flex items-center gap-1.5 text-[12.5px] font-bold text-penny">
              Run it
              <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
            </span>
          </button>
        ))}
      </div>
    </section>
  )
}
