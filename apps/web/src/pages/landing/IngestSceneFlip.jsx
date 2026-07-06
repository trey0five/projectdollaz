// ─────────────────────────────────────────────────────────────────────────────
// IngestSceneFlip — Act-II scene "THE FLIP". The paper itself IS the platform:
// the sheet rises out of the folder to center-stage, Penny bounces off it (a
// coin-tap), and the page does a slow 3-D flip — its back face is the app
// window — growing into the full frame as it turns. Statements, then the
// briefing. One object, two faces, zero ambiguity about what became what.
// ─────────────────────────────────────────────────────────────────────────────
import { motion, useTransform } from 'framer-motion'
import PennyAvatar from '../../components/penny/PennyAvatar.jsx'
import { AppWindow, Folder, SheetCard, WindowScreen } from './ingestShared.jsx'

export const BEATS = [
  {
    at: 0,
    title: 'It starts as paper.',
    line: 'A trial balance export, five years of history, a folder someone hands you at drop-off.',
  },
  {
    at: 0.18,
    title: 'The page rises.',
    line: 'Forty-six accounts, exactly as they left QuickBooks — no retyping, no cleanup.',
  },
  {
    at: 0.4,
    title: 'Penny gives it the tap.',
    line: 'She reads it, maps every account to your chart, and turns the page — literally.',
  },
  {
    at: 0.66,
    title: 'The other side is your platform.',
    line: 'Same numbers, re-set as your four statements — live, not a PDF.',
  },
  {
    at: 0.87,
    title: 'Tomorrow, it’s in your briefing.',
    line: '“Good morning — three things need a decision.” The file never sat in a drawer.',
  },
]

export function Stage({ p, beat }) {
  // Folder gives up the sheet, then recedes.
  const folderFlap = useTransform(p, [0.08, 0.2], [0, -70])
  const folderFade = useTransform(p, [0.24, 0.38], [1, 0.35])
  const folderScale = useTransform(p, [0.24, 0.38], [1, 0.85])
  // The flip card: rises from the folder to center-stage, grows, then FLIPS.
  // rotateY 0→180 across 0.46–0.66; the paper face shows till 90°, the window
  // face (pre-rotated 180°) takes over after — backface-visibility does the cut.
  const cardLeft = useTransform(p, [0, 0.12, 0.3], ['4%', '4%', '30%'])
  const cardTop = useTransform(p, [0.12, 0.3, 0.66, 0.8], ['34%', '18%', '18%', '8%'])
  const cardRotate = useTransform(p, [0.46, 0.66], [0, 180])
  const cardScale = useTransform(p, [0.12, 0.3, 0.46, 0.66], [0.85, 1.1, 1.1, 1])
  // Penny: swoops in, TAPS the card (a quick in-out nudge against its edge),
  // then hops clear while it turns, and parks at the window's corner.
  const pennyLeft = useTransform(
    p,
    [0.3, 0.4, 0.44, 0.47, 0.56, 0.86],
    ['-8%', '24%', '27.5%', '24%', '16%', '24%'],
  )
  const pennyTop = useTransform(
    p,
    [0.3, 0.4, 0.44, 0.47, 0.56, 0.86],
    ['-12%', '28%', '30%', '28%', '58%', '66%'],
  )
  const pennyFade = useTransform(p, [0.28, 0.36], [0, 1])
  // The card KICKS as she taps: a tiny rotate jolt right at contact.
  const cardKick = useTransform(p, [0.43, 0.45, 0.48], [0, 3, 0])
  // Screens on the window face.
  const rawFade = useTransform(p, [0.7, 0.76], [1, 0])
  const stmtFade = useTransform(p, [0.74, 0.8, 0.88, 0.92], [0, 1, 1, 0])
  const briefFade = useTransform(p, [0.9, 0.96], [0, 1])

  return (
    <>
      <motion.div style={{ opacity: folderFade, scale: folderScale }} className="absolute left-0 top-[48%] z-[15]">
        <Folder frontStyle={{ rotateX: folderFlap, transformPerspective: 700 }} />
      </motion.div>

      {/* The flip card (z 20; starts z-under the folder via its left/top origin) */}
      <motion.div
        style={{ left: cardLeft, top: cardTop, scale: cardScale, rotate: cardKick }}
        className="absolute z-20 w-[52%] max-w-sm"
      >
        <motion.div
          style={{ rotateY: cardRotate, transformPerspective: 1200, transformStyle: 'preserve-3d' }}
          className="relative"
        >
          {/* Paper face */}
          <div style={{ backfaceVisibility: 'hidden' }} className="relative">
            <div className="mx-auto w-fit">
              <SheetCard className="w-56 sm:w-64" />
            </div>
          </div>
          {/* Platform face (pre-rotated so it reads correctly after the turn) */}
          <div
            style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
            className="absolute inset-0"
          >
            <AppWindow>
              <WindowScreen
                rawStyle={{ opacity: rawFade }}
                stmtStyle={{ opacity: stmtFade }}
                briefStyle={{ opacity: briefFade }}
                rawCaption="Read from the page"
              />
            </AppWindow>
          </div>
        </motion.div>
      </motion.div>

      {/* Penny the page-turner (z 40) */}
      <motion.div
        style={{ left: pennyLeft, top: pennyTop, opacity: pennyFade }}
        className="absolute z-40 drop-shadow-[0_10px_18px_rgba(184,150,80,0.35)]"
      >
        <PennyAvatar size={58} glance={beat >= 4 ? 0 : 1} celebrate={beat === 4} active />
      </motion.div>
    </>
  )
}
