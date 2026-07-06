// ─────────────────────────────────────────────────────────────────────────────
// IngestSceneScan — Act-II scene "THE SCAN". Penny READS the document: the
// sheet rises out of the folder and holds center-stage, Penny glides down its
// right edge with a gold scan-line tracking her height, and every row she
// passes ghosts on the paper and streams as a ribbon of light into the app
// window — which builds its raw rows one landing at a time, then re-lays them
// into the statements and the briefing. The paper is left spent and dissolves.
// ─────────────────────────────────────────────────────────────────────────────
import { motion, useTransform } from 'framer-motion'
import { FileSpreadsheet } from 'lucide-react'
import PennyAvatar from '../../components/penny/PennyAvatar.jsx'
import { AppWindow, Folder, SHEET_ROWS, WindowScreen } from './ingestShared.jsx'

export const BEATS = [
  {
    at: 0,
    title: 'It starts as paper.',
    line: 'A trial balance export, five years of history, a folder someone hands you at drop-off.',
  },
  {
    at: 0.18,
    title: 'Hold it up.',
    line: 'Forty-six accounts, exactly as they left QuickBooks — no retyping, no cleanup.',
  },
  {
    at: 0.34,
    title: 'Penny reads every line.',
    line: 'She maps each account to your chart, shows her confidence, and streams it home.',
  },
  {
    at: 0.68,
    title: 'The paper is spent.',
    line: 'Every row now lives in your platform — re-set as your four statements.',
  },
  {
    at: 0.87,
    title: 'Tomorrow, it’s in your briefing.',
    line: '“Good morning — three things need a decision.” The file never sat in a drawer.',
  },
]

// The read runs p 0.34 → 0.66; each of the 5 rows gets its own slice.
const READ_START = 0.34
const READ_END = 0.66
const rowBand = (i) => {
  const step = (READ_END - READ_START) / SHEET_ROWS.length
  return [READ_START + i * step, READ_START + (i + 1) * step]
}

/** One paper row: full-ink until Penny's line passes it, then gold-ghost. */
function PaperRow({ p, i }) {
  const [a, b] = rowBand(i)
  const inked = useTransform(p, [a, b], [1, 0.28])
  const tint = useTransform(p, [a, b], [0, 1])
  return (
    <motion.div style={{ opacity: inked }} className="relative flex items-center justify-between gap-3">
      <span className="truncate text-[11px] text-ink/80">{SHEET_ROWS[i][0]}</span>
      <span className="text-[11px] tabular-nums text-muted">{SHEET_ROWS[i][1]}</span>
      <motion.span
        style={{ opacity: tint }}
        className="pointer-events-none absolute inset-x-[-6px] inset-y-[-2px] rounded bg-gold/15"
        aria-hidden="true"
      />
    </motion.div>
  )
}

/** One streaming ribbon: fires across the gap while its row is being read. */
function Streak({ p, i }) {
  const [a, b] = rowBand(i)
  const x = useTransform(p, [a, b], ['0%', '2600%'])
  const opacity = useTransform(p, [a, a + 0.02, b - 0.01, b], [0, 1, 1, 0])
  // Rows sit ~34px apart on the big sheet; streaks start at the row's height.
  return (
    <motion.span
      style={{ x, opacity, top: `${34 + i * 11.5}%` }}
      className="absolute left-[36%] z-[18] h-1.5 w-6 rounded-full bg-gold-gradient shadow-glow"
      aria-hidden="true"
    />
  )
}

export function Stage({ p, beat }) {
  // Folder gives up the sheet, then recedes to the corner.
  const folderFlap = useTransform(p, [0.06, 0.18], [0, -70])
  const folderFade = useTransform(p, [0.22, 0.36], [1, 0.35])
  const folderScale = useTransform(p, [0.22, 0.36], [1, 0.85])
  // The sheet rises to center-stage and GROWS (it's the hero of this scene),
  // then dissolves once spent.
  const sheetLeft = useTransform(p, [0, 0.1, 0.26], ['3%', '3%', '6%'])
  const sheetTop = useTransform(p, [0.1, 0.26], ['32%', '6%'])
  const sheetScale = useTransform(p, [0.1, 0.26], [0.8, 1])
  const sheetFade = useTransform(p, [0.68, 0.8], [1, 0])
  const sheetY = useTransform(p, [0.68, 0.8], [0, 24])
  // The scan line + Penny track the SAME read progress down the sheet's edge.
  const scanTop = useTransform(p, [READ_START, READ_END], ['30%', '88%'])
  const scanFade = useTransform(p, [0.3, 0.34, READ_END, 0.7], [0, 1, 1, 0])
  const pennyTop = useTransform(p, [0.26, READ_START, READ_END, 0.8, 0.9], ['-12%', '16%', '74%', '60%', '58%'])
  const pennyLeft = useTransform(p, [0.26, READ_START, READ_END, 0.8, 0.9], ['20%', '33%', '33%', '46%', '46%'])
  const pennyFade = useTransform(p, [0.24, 0.3], [0, 1])
  // The window waits on the right and builds as ribbons land.
  const winFade = useTransform(p, [0.3, 0.38], [0, 1])
  const winX = useTransform(p, [0.3, 0.38], [24, 0])
  const winTop = useTransform(p, [0.7, 0.8], ['20%', '10%'])
  const winScale = useTransform(p, [0.7, 0.8], [0.94, 1])
  const rawFade = useTransform(p, [0.72, 0.78], [1, 0])
  const stmtFade = useTransform(p, [0.76, 0.82, 0.88, 0.92], [0, 1, 1, 0])
  const briefFade = useTransform(p, [0.9, 0.96], [0, 1])
  // Raw rows land one at a time, in step with the read.
  const rawRowStyles = [0, 1, 2, 3, 4, 5].map((i) => {
    const [a, b] = rowBand(Math.min(i, SHEET_ROWS.length - 1))
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const opacity = useTransform(p, [a + 0.02, b], [0.12, 1])
    return { opacity }
  })

  return (
    <>
      {/* Folder (z 15) — conceals the sheet (z 10) at rest */}
      <motion.div
        style={{
          left: sheetLeft,
          top: sheetTop,
          scale: sheetScale,
          opacity: sheetFade,
          y: sheetY,
        }}
        className="absolute z-10 w-[30%] min-w-[210px]"
      >
        <div className="overflow-hidden rounded-xl border border-rule/70 bg-white shadow-paper">
          <div className="flex items-center gap-1.5 border-b border-rule/50 bg-section px-3 py-2">
            <FileSpreadsheet size={13} className="shrink-0 text-[#7a5e00]" />
            <span className="truncate text-[11px] font-semibold tracking-wide text-muted">
              trial_balance_fy26.xlsx
            </span>
          </div>
          <div className="space-y-2.5 px-3 py-3">
            {SHEET_ROWS.map((_, i) => (
              <PaperRow key={i} p={p} i={i} />
            ))}
          </div>
        </div>
        {/* The scan line, spanning the sheet at Penny's height */}
        <motion.div
          style={{ top: scanTop, opacity: scanFade }}
          className="absolute inset-x-[-4%] h-[3px] rounded-full bg-gold-gradient shadow-glow"
          aria-hidden="true"
        />
      </motion.div>

      <motion.div style={{ opacity: folderFade, scale: folderScale }} className="absolute left-0 top-[52%] z-[15]">
        <Folder frontStyle={{ rotateX: folderFlap, transformPerspective: 700 }} />
      </motion.div>

      {/* Streaming ribbons: paper → window */}
      {SHEET_ROWS.map((_, i) => (
        <Streak key={i} p={p} i={i} />
      ))}

      {/* The window (z 20) builds row by row as ribbons land */}
      <motion.div
        style={{ opacity: winFade, x: winX, top: winTop, scale: winScale }}
        className="absolute right-0 z-20 w-[54%] max-w-sm"
      >
        <AppWindow>
          <WindowScreen
            rawStyle={{ opacity: rawFade }}
            stmtStyle={{ opacity: stmtFade }}
            briefStyle={{ opacity: briefFade }}
            rawRowStyles={rawRowStyles}
            rawCaption="Streaming in…"
          />
        </AppWindow>
      </motion.div>

      {/* Penny the reader (z 40) — rides the sheet's right edge with the line */}
      <motion.div
        style={{ left: pennyLeft, top: pennyTop, opacity: pennyFade }}
        className="absolute z-40 drop-shadow-[0_10px_18px_rgba(184,150,80,0.35)]"
      >
        <PennyAvatar size={56} glance={beat >= 4 ? 0 : 1} celebrate={beat === 4} active />
      </motion.div>
    </>
  )
}
