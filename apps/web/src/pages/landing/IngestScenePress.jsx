// ─────────────────────────────────────────────────────────────────────────────
// IngestScenePress — Act-II scene "THE LEDGER PRESS" (the default). Paper goes
// in one side of an ornate navy machine, Penny lands on the gold button to run
// it (gears scrub with the scroll), and the platform window rolls out the
// other side. All occlusion, no clip-paths: sheet z10 < folder z15 (fully
// hidden at rest) < window z20 < press z30 < Penny z40; the window's z flips
// above the press the moment it "lifts off the tray".
// ─────────────────────────────────────────────────────────────────────────────
import { motion, useTransform } from 'framer-motion'
import PennyAvatar from '../../components/penny/PennyAvatar.jsx'
import { AppWindow, Folder, Press, SheetCard, WindowScreen } from './ingestShared.jsx'

export const BEATS = [
  {
    at: 0,
    title: 'It starts as paper.',
    line: 'A trial balance export, five years of history, a folder someone hands you at drop-off.',
  },
  {
    at: 0.16,
    title: 'Feed the press.',
    line: 'The trial balance goes in exactly as it left QuickBooks — no retyping, no cleanup.',
  },
  {
    at: 0.4,
    title: 'Penny runs the press.',
    line: 'She reads every account, maps it to your chart of accounts, and shows her work.',
  },
  {
    at: 0.62,
    title: 'Out comes your platform.',
    line: 'The same numbers, re-set as your four statements — live, not a PDF.',
  },
  {
    at: 0.85,
    title: 'Tomorrow, it’s in your briefing.',
    line: '“Good morning — three things need a decision.” The file never sat in a drawer.',
  },
]

export function Stage({ p, beat }) {
  const folderFlap = useTransform(p, [0.1, 0.24], [0, -70])
  const folderFade = useTransform(p, [0.3, 0.46], [1, 0.45])
  const folderScale = useTransform(p, [0.3, 0.46], [1, 0.94])
  const sheetLeft = useTransform(p, [0, 0.14, 0.3, 0.44], ['3%', '3%', '24%', '46%'])
  const sheetTop = useTransform(p, [0.14, 0.3, 0.44], ['34%', '28%', '28%'])
  const sheetRotate = useTransform(p, [0.14, 0.3, 0.44], [0, -3, 2])
  const sheetScale = useTransform(p, [0.3, 0.44], [1, 0.82])
  const pennyLeft = useTransform(p, [0.26, 0.38, 0.84, 0.94], ['-6%', '59%', '59%', '46%'])
  const pennyTop = useTransform(p, [0.26, 0.38, 0.84, 0.94], ['-12%', '0%', '0%', '60%'])
  const pennyFade = useTransform(p, [0.26, 0.34], [0, 1])
  const buttonY = useTransform(p, [0.38, 0.42], [0, 5])
  const gearRotate = useTransform(p, [0.4, 0.84], [0, 480])
  const gearRotateCcw = useTransform(p, [0.4, 0.84], [0, -480])
  const lampOn = useTransform(p, [0.38, 0.44], [0, 1])
  const inkWidth = useTransform(p, [0.42, 0.64], ['0%', '100%'])
  const faceTextOpacity = useTransform(p, [0.42, 0.46, 0.62, 0.68], [0, 1, 1, 0])
  const pressGlow = useTransform(p, [0.4, 0.5, 0.66, 0.76], [0, 0.8, 0.8, 0])
  const pressScale = useTransform(p, [0.84, 0.94], [1, 0.94])
  const pressFade = useTransform(p, [0.84, 0.94], [1, 0.4])
  const pressX = useTransform(p, [0.84, 0.94], ['0%', '-6%'])
  const winLeft = useTransform(p, [0.56, 0.76], ['36%', '48%'])
  const winFade = useTransform(p, [0.55, 0.6], [0, 1])
  const winTop = useTransform(p, [0.78, 0.88], ['30%', '8%'])
  const winScale = useTransform(p, [0.56, 0.88], [0.8, 1])
  // Lifting off the tray = picked up: from here the window rides ABOVE the press.
  const winZ = useTransform(p, (v) => (v >= 0.8 ? 35 : 20))
  const rawFade = useTransform(p, [0.76, 0.8], [1, 0])
  const stmtFade = useTransform(p, [0.79, 0.83, 0.88, 0.92], [0, 1, 1, 0])
  const briefFade = useTransform(p, [0.9, 0.96], [0, 1])

  return (
    <>
      <motion.div
        style={{ left: sheetLeft, top: sheetTop, rotate: sheetRotate, scale: sheetScale }}
        className="absolute z-10"
      >
        <SheetCard />
      </motion.div>

      <motion.div style={{ opacity: folderFade, scale: folderScale }} className="absolute left-0 top-[26%] z-[15]">
        <Folder frontStyle={{ rotateX: folderFlap, transformPerspective: 700 }} />
      </motion.div>

      <motion.div
        style={{ left: winLeft, top: winTop, scale: winScale, opacity: winFade, zIndex: winZ }}
        className="absolute w-[58%] max-w-sm"
      >
        <AppWindow>
          <WindowScreen
            rawStyle={{ opacity: rawFade }}
            stmtStyle={{ opacity: stmtFade }}
            briefStyle={{ opacity: briefFade }}
          />
        </AppWindow>
      </motion.div>

      <motion.div style={{ scale: pressScale, opacity: pressFade, x: pressX }} className="absolute left-[42%] top-[14%] z-30">
        <Press
          gearRotate={gearRotate}
          gearRotateCcw={gearRotateCcw}
          lampOn={lampOn}
          buttonY={buttonY}
          inkWidth={inkWidth}
          faceTextOpacity={faceTextOpacity}
          glow={pressGlow}
        />
      </motion.div>

      <motion.div
        style={{ left: pennyLeft, top: pennyTop, opacity: pennyFade }}
        className="absolute z-40 drop-shadow-[0_10px_18px_rgba(184,150,80,0.35)]"
      >
        <PennyAvatar size={60} glance={beat >= 4 ? 0 : 1} celebrate={beat === 4} active />
      </motion.div>
    </>
  )
}
