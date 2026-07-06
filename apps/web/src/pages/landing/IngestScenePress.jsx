// ─────────────────────────────────────────────────────────────────────────────
// IngestScenePress — Act-II scene "THE LEDGER PRESS" (the default). The folder
// and the machine stand level in the visual column (clear of the ledger
// spine); the sheet rises, aligns with the glowing intake, and feeds in
// perfectly horizontally; Penny lands ON TOP of the press to wake it (gears
// scrub with the scroll); the finished window DEVELOPS out of the machine's
// face with a gold flash, then takes the spotlight the folder vacated.
// Occlusion does the hiding: sheet z10 < folder z15 < press z30 < window z35
// < Penny z40.
// ─────────────────────────────────────────────────────────────────────────────
import { motion, useTransform } from 'framer-motion'
import PennyAvatar from '../../components/penny/PennyAvatar.jsx'
import { AppWindow, FolderBack, FolderFront, Press, SheetCard, WindowScreen } from './ingestShared.jsx'

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
  // Folder: level with the press, clear of the ledger spine; gives up the
  // sheet, then fades away entirely — the platform will take its spot.
  const folderFlap = useTransform(p, [0.1, 0.22], [0, -70])
  const folderFade = useTransform(p, [0.3, 0.52], [1, 0])
  const folderScale = useTransform(p, [0.3, 0.52], [1, 0.92])
  // Sheet: rises out of the folder, ALIGNS level with the intake slot, then
  // feeds in perfectly horizontally (no diagonal drift) while the intake glows.
  const sheetLeft = useTransform(p, [0, 0.24, 0.34, 0.48], ['17%', '17%', '28%', '58%'])
  const sheetTop = useTransform(p, [0, 0.14, 0.24, 0.32], ['25%', '25%', '7%', '27%'])
  const sheetRotate = useTransform(p, [0.14, 0.24, 0.32], [0, -4, 0])
  const sheetScale = useTransform(p, [0, 0.14, 0.26, 0.34, 0.48], [0.9, 0.9, 1, 1, 0.88])
  const sheetFade = useTransform(p, [0.5, 0.56], [1, 0])
  const intakeGlow = useTransform(p, [0.32, 0.38, 0.46, 0.52], [0, 1, 1, 0])
  // Penny: swoops in and lands ON TOP of the press (no button — the machine
  // wakes when she touches down, with a little dip), then hops to the window.
  const pennyLeft = useTransform(p, [0.3, 0.4, 0.86, 0.95], ['-6%', '72%', '72%', '20%'])
  const pennyTop = useTransform(p, [0.3, 0.4, 0.86, 0.95], ['-14%', '2%', '2%', '56%'])
  const pennyFade = useTransform(p, [0.28, 0.36], [0, 1])
  // Press internals — everything keys off Penny's touchdown at 0.4.
  const pressDip = useTransform(p, [0.4, 0.43, 0.46], [1, 0.98, 1])
  const gearRotate = useTransform(p, [0.42, 0.74], [0, 420])
  const gearRotateCcw = useTransform(p, [0.42, 0.74], [0, -420])
  const lampOn = useTransform(p, [0.4, 0.46], [0, 1])
  const inkWidth = useTransform(p, [0.46, 0.64], ['0%', '100%'])
  const faceTextOpacity = useTransform(p, [0.46, 0.5, 0.6, 0.66], [0, 1, 1, 0])
  const pressGlow = useTransform(p, [0.44, 0.56, 0.6, 0.68], [0, 0.9, 0.9, 0])
  // The morph: the finished window DEVELOPS out of the press's face (the
  // machine dims behind it), then glides to the spotlight the folder vacated.
  const pressFade = useTransform(p, [0.68, 0.8], [1, 0.22])
  const winFade = useTransform(p, [0.6, 0.66], [0, 1])
  const winScale = useTransform(p, [0.6, 0.74], [0.72, 1])
  const winLeft = useTransform(p, [0.62, 0.78, 0.92], ['48%', '48%', '15%'])
  const winTop = useTransform(p, [0.62, 0.78, 0.92], ['16%', '16%', '8%'])
  const winFlash = useTransform(p, [0.6, 0.66, 0.76], [0, 0.8, 0])
  const rawFade = useTransform(p, [0.76, 0.82], [1, 0])
  const stmtFade = useTransform(p, [0.8, 0.85, 0.9, 0.93], [0, 1, 1, 0])
  const briefFade = useTransform(p, [0.91, 0.97], [0, 1])

  return (
    <>
      {/* Folder BACK panel (z 12) — the sheet rises from INSIDE the folder,
          sandwiched between the back panel and the front flap */}
      <motion.div style={{ opacity: folderFade, scale: folderScale }} className="absolute left-[15%] top-[20%] z-[12]">
        <FolderBack />
      </motion.div>

      {/* The traveling sheet (z 14 — inside the folder; behind the press) */}
      <motion.div
        style={{ left: sheetLeft, top: sheetTop, rotate: sheetRotate, scale: sheetScale, opacity: sheetFade }}
        className="absolute z-[14]"
      >
        <SheetCard />
      </motion.div>

      {/* Folder FRONT flap (z 16) — conceals the sheet at rest; opens forward */}
      <motion.div style={{ opacity: folderFade, scale: folderScale }} className="absolute left-[15%] top-[20%] z-[16]">
        <FolderFront frontStyle={{ rotateX: folderFlap, transformPerspective: 700 }} />
      </motion.div>

      {/* THE PRESS (z 30 — swallows the sheet through the glowing intake) */}
      <motion.div style={{ scale: pressDip, opacity: pressFade }} className="absolute left-[54%] top-[14%] z-30">
        <Press
          gearRotate={gearRotate}
          gearRotateCcw={gearRotateCcw}
          lampOn={lampOn}
          inkWidth={inkWidth}
          faceTextOpacity={faceTextOpacity}
          glow={pressGlow}
          intakeGlow={intakeGlow}
        />
      </motion.div>

      {/* The freshly-pressed window (z 35 — develops out of the press's face,
          gold flash at first light, then takes the folder's vacated spotlight) */}
      <motion.div
        style={{ left: winLeft, top: winTop, scale: winScale, opacity: winFade }}
        className="absolute z-[35] w-[58%] max-w-sm"
      >
        <div className="relative">
          <AppWindow>
            <WindowScreen
              rawStyle={{ opacity: rawFade }}
              stmtStyle={{ opacity: stmtFade }}
              briefStyle={{ opacity: briefFade }}
            />
          </AppWindow>
          <motion.div
            style={{ opacity: winFlash }}
            className="pointer-events-none absolute inset-0 rounded-2xl ring-4 ring-inset ring-gold/70"
            aria-hidden="true"
          />
        </div>
      </motion.div>

      {/* Penny the operator (z 40 — always on top) */}
      <motion.div
        style={{ left: pennyLeft, top: pennyTop, opacity: pennyFade }}
        className="absolute z-40 drop-shadow-[0_10px_18px_rgba(184,150,80,0.35)]"
      >
        <PennyAvatar size={60} glance={beat >= 4 ? 0 : 1} celebrate={beat === 4} active />
      </motion.div>
    </>
  )
}
