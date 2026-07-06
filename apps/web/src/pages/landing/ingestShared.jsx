// ─────────────────────────────────────────────────────────────────────────────
// ingestShared — the stage props for the Act-II scrollytelling scene: the
// trial-balance sheet, the manila folder, the app window + its three
// crossfading screens, and the Ledger Press machine. Pure presentation; every
// animated part arrives as MotionValue styles so the scene scrubs, never plays.
// ─────────────────────────────────────────────────────────────────────────────
import { motion } from 'framer-motion'
import { FileSpreadsheet } from 'lucide-react'

export const SHEET_ROWS = [
  ['4010 Tuition', '9,842,000'],
  ['5020 Salaries', '6,214,300'],
  ['1000 Cash', '1,238,450'],
  ['6110 Plant', '412,880'],
  ['2000 Payables', '389,120'],
]

/** The trial-balance sheet — a mini spreadsheet card. `rowStyles[i]` lets a
 *  scene animate individual rows. */
export function SheetCard({ rowStyles = null, className = 'w-40 sm:w-44' }) {
  return (
    <div className={`${className} overflow-hidden rounded-lg border border-rule/70 bg-white shadow-paper`}>
      <div className="flex items-center gap-1.5 border-b border-rule/50 bg-section px-2.5 py-1.5">
        <FileSpreadsheet size={12} className="shrink-0 text-[#7a5e00]" />
        <span className="truncate text-[10px] font-semibold tracking-wide text-muted">
          trial_balance_fy26.xlsx
        </span>
      </div>
      <div className="space-y-1.5 px-2.5 py-2">
        {SHEET_ROWS.map(([acct, amt], i) => (
          <motion.div
            key={acct}
            style={rowStyles ? rowStyles[i] : undefined}
            className="flex items-center justify-between gap-2"
          >
            <span className="truncate text-[9px] text-ink/70">{acct}</span>
            <span className="text-[9px] tabular-nums text-muted">{amt}</span>
          </motion.div>
        ))}
      </div>
    </div>
  )
}

/** The manila folder, split in two so a scene can sandwich the sheet BETWEEN
 *  the panels (back < sheet < front) and have it rise from INSIDE. The front
 *  flap is tall enough to conceal the sheet completely at rest. */
export function FolderBack() {
  return (
    <div className="relative h-40 w-48 sm:h-44 sm:w-52">
      <div className="absolute inset-x-0 bottom-0 top-4 rounded-2xl border border-gold/50 bg-gold-pale shadow-card" />
      <div className="absolute left-3 top-0 h-7 w-24 rounded-t-xl border border-b-0 border-gold/50 bg-gold-pale" />
    </div>
  )
}

export function FolderFront({ frontStyle }) {
  return (
    <div className="relative h-40 w-48 sm:h-44 sm:w-52">
      <motion.div
        style={frontStyle}
        className="absolute inset-x-0 bottom-0 flex h-[85%] origin-bottom items-end rounded-2xl border border-gold/60 bg-gold-gradient p-3.5 shadow-card"
      >
        <span className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-navy/80">
          FY26 · Finance office
        </span>
      </motion.div>
    </div>
  )
}

/** The composed folder (StaticFrame + simple uses). */
export function Folder({ frontStyle }) {
  return (
    <div className="relative h-40 w-48 sm:h-44 sm:w-52">
      <div className="absolute inset-0"><FolderBack /></div>
      <div className="absolute inset-0"><FolderFront frontStyle={frontStyle} /></div>
    </div>
  )
}

/**
 * THE LEDGER PRESS — an ornate navy machine with an in-slot (left), an
 * out-slot (right), gears that turn with the scroll, a status lamp, an
 * ink-progress bar, and the big gold button Penny operates.
 */
export function Press({ gearRotate, gearRotateCcw, lampOn, inkWidth, faceTextOpacity, glow, intakeGlow = 0 }) {
  return (
    <div className="relative h-52 w-60 sm:h-60 sm:w-72">
      <div className="absolute inset-x-6 top-0 flex h-9 items-center justify-center rounded-t-2xl border border-b-0 border-gold/50 bg-navy-deep">
        <span className="text-[9px] font-bold uppercase tracking-[0.3em] text-gold-light/90">
          Penny AI
        </span>
      </div>
      <div className="absolute inset-x-0 bottom-0 top-8 overflow-hidden rounded-2xl border-2 border-gold/50 bg-navy-gradient shadow-navy-glow">
        <div className="absolute inset-3 rounded-xl border border-white/10">
          <motion.div
            style={{ rotate: gearRotate }}
            className="absolute left-3 top-3 h-12 w-12 rounded-full border-4 border-dashed border-gold/45"
          />
          <motion.div
            style={{ rotate: gearRotateCcw }}
            className="absolute left-12 top-9 h-8 w-8 rounded-full border-4 border-dashed border-gold/30"
          />
          <div className="absolute right-3 top-3 h-3.5 w-3.5 rounded-full border border-white/25 bg-white/10">
            <motion.div style={{ opacity: lampOn }} className="h-full w-full rounded-full bg-gold shadow-glow" />
          </div>
          <motion.p
            style={{ opacity: faceTextOpacity }}
            className="absolute inset-x-3 top-[52%] text-center text-[9px] font-bold uppercase tracking-[0.22em] text-gold-light"
          >
            Reading 46 accounts…
          </motion.p>
          <div className="absolute inset-x-4 bottom-4 h-2 overflow-hidden rounded-full bg-white/10">
            <motion.div style={{ width: inkWidth }} className="h-full rounded-full bg-gold-gradient" />
          </div>
        </div>
        <motion.div
          style={{ opacity: glow }}
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_60%_at_50%_45%,rgba(212,178,122,0.35),transparent_70%)]"
        />
      </div>
      {/* In-slot with an intake glow that brightens while the sheet feeds */}
      <div className="absolute -left-1 top-[46%] h-16 w-2.5 rounded-full border border-gold/60 bg-navy-deep" />
      <motion.div
        style={{ opacity: intakeGlow }}
        className="absolute -left-1.5 top-[44%] h-[74px] w-3.5 rounded-full bg-gold/70 blur-[3px]"
        aria-hidden="true"
      />
    </div>
  )
}

/** Inside-window screens: raw rows → statements → briefing (crossfaded layers).
 *  `rawRowStyles[i]` lets a scene land raw rows one at a time. */
export function WindowScreen({ rawStyle, stmtStyle, briefStyle, rawRowStyles = null, rawCaption = 'Fresh off the press' }) {
  return (
    <div className="relative h-52 sm:h-56">
      <motion.div style={rawStyle} className="absolute inset-0 space-y-2 p-4">
        {[82, 64, 91, 55, 73, 68].map((w, i) => (
          <motion.div key={i} style={rawRowStyles ? rawRowStyles[i] : undefined} className="flex items-center gap-2">
            <span className="h-2 w-10 rounded bg-navy/15" />
            <span className="h-2 rounded bg-gold/30" style={{ width: `${w * 0.6}%` }} />
          </motion.div>
        ))}
        <p className="pt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted/70">{rawCaption}</p>
      </motion.div>
      <motion.div style={stmtStyle} className="absolute inset-0 p-4">
        <div className="flex flex-wrap gap-1.5">
          {['Activities', 'Financial Position', 'Cash Flows', 'Net Assets'].map((t, i) => (
            <span
              key={t}
              className={`rounded-full border px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wide ${
                i === 0 ? 'border-gold/60 bg-gold/15 text-[#7a5e00]' : 'border-rule/60 bg-white text-muted'
              }`}
            >
              {t}
            </span>
          ))}
        </div>
        <div className="mt-3 space-y-2">
          {[
            ['Tuition & fees', '92%'],
            ['Total revenue', '78%'],
            ['Total expense', '64%'],
            ['Change in net assets', '30%'],
          ].map(([label, w]) => (
            <div key={label}>
              <span className="text-[10px] text-ink/70">{label}</span>
              <div className="mt-0.5 h-2 rounded bg-navy/10">
                <div className="h-2 rounded bg-gold-gradient" style={{ width: w }} />
              </div>
            </div>
          ))}
        </div>
      </motion.div>
      <motion.div style={briefStyle} className="absolute inset-0 p-4">
        <p className="font-serif text-[15px] font-semibold leading-snug text-navy">
          Good morning — 3 things need a decision.
        </p>
        <ul className="mt-3 space-y-2">
          {[
            ['bg-danger', 'Cash dips below 60 days in November'],
            ['bg-gold', 'Enrollment is 6 below plan'],
            ['bg-navy/50', 'Two policies due for review'],
          ].map(([dot, text]) => (
            <li key={text} className="flex items-start gap-2 text-[11.5px] leading-snug text-ink/80">
              <span aria-hidden="true" className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
              {text}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#7a5e00]">
          Drafted from the file you dropped
        </p>
      </motion.div>
    </div>
  )
}

/** App-window chrome around a screen. */
export function AppWindow({ children }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-navy/20 bg-white shadow-paper">
      <div className="flex items-center gap-1.5 bg-navy-gradient px-3 py-2">
        <span className="h-2 w-2 rounded-full bg-white/30" />
        <span className="h-2 w-2 rounded-full bg-white/30" />
        <span className="h-2 w-2 rounded-full bg-gold" />
        <span className="ml-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/70">
          Project Dollaz
        </span>
      </div>
      {children}
    </div>
  )
}
