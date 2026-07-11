// ─────────────────────────────────────────────────────────────────────────────
// ModuleFlowGuide — a WORDLESS-first "how to operate this module" strip, shown on
// the Overview tab. Instead of a paragraph of instructions, it draws the module's
// actions as a numbered visual FLOW: big hue-tinted icons (Add data → Records →
// Reports) connected by arrows. Each step is a button that jumps to that tab, so
// the picture both teaches AND operates. Icons + step numbers + arrows carry the
// meaning; the short tab label is the only text.
// ─────────────────────────────────────────────────────────────────────────────
import { Fragment } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Upload, Table2, FileBarChart2, ArrowRight, MousePointerClick } from 'lucide-react'
import { moduleHue, TAB_LABEL } from './moduleAnatomy.js'

// The verb-icon for each action tab (recognizable at a glance).
const STEP_ICON = { add: Upload, records: Table2, reports: FileBarChart2 }

export default function ModuleFlowGuide({ moduleKey, tabs, onStep }) {
  const reduce = useReducedMotion()
  const hue = moduleHue(moduleKey)
  const steps = tabs.filter((t) => t !== 'overview')
  if (steps.length === 0) return null

  return (
    <div className="mx-auto max-w-[1180px] px-4 pt-5 sm:px-10">
      <div
        className="flex flex-wrap items-center gap-2 rounded-2xl border p-2.5 sm:gap-2 sm:p-3"
        style={{ borderColor: `${hue}33`, background: `${hue}0a` }}
      >
        {/* Wordless cue: a pointer glyph says "these are clickable steps". */}
        <span
          aria-hidden="true"
          className="ml-1 mr-0.5 hidden h-9 w-9 shrink-0 items-center justify-center rounded-full sm:flex"
          style={{ background: `${hue}1f`, color: hue }}
        >
          <MousePointerClick size={17} />
        </span>
        {steps.map((t, i) => {
          const Icon = STEP_ICON[t] ?? Upload
          return (
            <Fragment key={t}>
              <motion.button
                type="button"
                onClick={() => onStep(t)}
                whileHover={reduce ? undefined : { y: -3 }}
                whileTap={reduce ? undefined : { scale: 0.98 }}
                aria-label={`Step ${i + 1}: ${TAB_LABEL[t]}`}
                className="group flex min-w-[132px] flex-1 items-center gap-3 rounded-xl bg-white/70 px-3 py-2.5 text-left outline-none ring-offset-2 transition-colors hover:bg-white focus-visible:ring-2"
                style={{ '--tw-ring-color': hue }}
              >
                <span
                  className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-white shadow-sm transition-transform group-hover:scale-105"
                  style={{ background: hue }}
                >
                  <Icon size={22} />
                  <span
                    className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-white text-[11px] font-extrabold shadow"
                    style={{ color: hue }}
                  >
                    {i + 1}
                  </span>
                </span>
                <span className="text-[14.5px] font-bold text-navy">{TAB_LABEL[t]}</span>
              </motion.button>
              {i < steps.length - 1 && (
                <ArrowRight size={20} aria-hidden="true" className="hidden shrink-0 sm:block" style={{ color: `${hue}99` }} />
              )}
            </Fragment>
          )
        })}
      </div>
    </div>
  )
}
