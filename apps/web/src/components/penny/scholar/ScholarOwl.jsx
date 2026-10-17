// ─────────────────────────────────────────────────────────────────────────────
// ScholarOwl — KYRO's mascot, "B · The Scholar": the indigo owl with gold
// spectacles and a mortarboard whose tassel swings with every move.
//
// The drawing and every move come from the plain-JS core in ./core (shared with
// the demo-film rig, so the film owl IS the app owl). This component only:
//   1. renders the SVG once (React never re-renders the parts),
//   2. joins the ONE shared animation loop (scholarTicker) unless paused or
//      reduced motion, and
//   3. feeds the loop its props.
//
// Props — a superset of the old KyroDove, so every call site compiles as is:
//   size        HEIGHT of the box in px; width = size × 0.727. Also honours the
//               CSS var `--kyro-size` on any ancestor.
//   state       'perched' | 'flying' | 'gliding' (the flight engine's phase).
//               perched after flying/gliding plays the landing by itself.
//   facing      'left' | 'right' | undefined. In the air the owl MIRRORS to face
//               its travel; perched it turns its eyes/head instead (never
//               mirrored at rest, so the cap and tassel stay put).
//   glance      -1 | 0 | 1, legacy; non-zero overrides `facing`.
//   active      no visual (the open chat is the affordance), as before.
//   speaking    talking (beak, wing gestures).
//   listening   leans in, brows up (no rings — nothing round behind the owl).
//   thinking    chin tap, eyes up, the "…" cloud (top-right; see thinkingDots).
//   oops        glasses slip, sheepish scratch (continuous).
//   mood        one-shot: 'hello' | 'celebrate' | 'oops' | 'wink' | 'whoa'.
//               Plays each time `mood` or `moodKey` changes.
//   moodKey     change it to replay the same mood.
//   moodHold    true → `mood` is HELD by the caller (e.g. a scroll beat): when
//               it goes back to null the one-shot ends at once instead of
//               playing out its full length. Opt-in; without it a mood always
//               plays to the end.
//   onMoodEnd   called with the mood's name when it finishes.
//   celebrate   true → a one-shot cap toss (on the rising edge).
//   confetti    the celebrate burst; owls ≥ 96px only (default on there).
//   tone        'light' | 'dark' — dark adds a sky-blue rim + glow on the BIRD
//               (never the shadow) for navy / Studio / Aurora surfaces.
//   thinkingDots false hides the thought cloud (e.g. while a speech bubble shows).
//   perch       false hides the ground shadow.
//   paused      freezes the owl where it is (leaves the loop).
//   seed        blink / confetti seed (the film pins it; default per owl).
//   blink       true → one real blink on the rising edge (the landing demo's
//               scripted beat); the owl also blinks by itself.
//   className, style  on the box.
//
// Under prefers-reduced-motion the owl is still: the neutral pose, tassel
// hanging straight, never in the loop. Decorative: aria-hidden.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useId, useLayoutEffect, useMemo, useRef } from 'react'
import { useReducedMotion } from 'framer-motion'
import { scholarMarkup, collectParts, writePose } from './core/scholarArt.js'
import { createScholarAnimator, seedFrom } from './core/scholarEval.js'
import { scholarTicker } from './core/scholarTicker.js'
import { ASPECT, VIEWBOX, VIEWBOX_ATTR } from './core/scholarGeometry.js'
import { TINY_PX, CONFETTI_MIN_PX } from './core/scholarTracks.js'

export { useScholarGeometry } from './useScholarGeometry.js'

const PHASES = ['perched', 'flying', 'gliding']
const READS_BOX = new Set(['flying', 'gliding', 'landing'])
const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())

export default function ScholarOwl({
  size = 56,
  state = 'perched',
  facing,
  glance = 0,
  active = false,
  speaking = false,
  listening = false,
  thinking = false,
  oops = false,
  mood = null,
  moodKey,
  moodHold = false,
  onMoodEnd,
  celebrate = false,
  confetti,
  tone = 'light',
  thinkingDots = true,
  perch = true,
  paused = false,
  seed,
  blink = false,
  className = '',
  style,
}) {
  const reduce = !!useReducedMotion()
  const rawId = useId()
  const uid = `sc${rawId.replace(/[^a-zA-Z0-9_-]/g, '')}`
  const hostRef = useRef(null)

  const tiny = size <= TINY_PX
  const dark = tone === 'dark'
  const confettiOn = confetti !== false && !tiny && size >= CONFETTI_MIN_PX
  // Dark-tone rim ≈ 1.6px on screen whatever the size (in owl units).
  const rim = Math.round(Math.min(9, Math.max(2.5, (1.6 * VIEWBOX.h) / size)) * 2) / 2
  const phase = reduce ? 'perched' : PHASES.includes(state) ? state : 'perched'
  const dir = glance ? Math.sign(glance) : facing === 'left' ? -1 : facing === 'right' ? 1 : 0

  const markup = useMemo(
    () => scholarMarkup({ uid, viewBox: VIEWBOX_ATTR, tiny, tone: dark ? 'dark' : 'light', rim, confetti: confettiOn }),
    [uid, tiny, dark, rim, confettiOn],
  )
  // ONE object per markup: React 19 re-sets innerHTML whenever this object's
  // identity changes (not just its string), which would orphan the parts the
  // loop writes to.
  const html = useMemo(() => ({ __html: markup }), [markup])

  // Everything the loop reads. Touched only in effects and in the loop itself
  // (never during render), refreshed after every render.
  const live = useRef(null)
  const ownSeed = seed ?? seedFrom(uid)

  useLayoutEffect(() => {
    if (!live.current) {
      live.current = {
        animator: createScholarAnimator({ seed: ownSeed }),
        parts: null,
        cache: {},
        inputs: {},
        mood: null,
        moodSeq: 0,
        travel: null,
        state: null,
        onMoodEnd: null,
        paint: null,
        blinkStart: null,
      }
    }
    const L = live.current
    L.inputs = {
      phase,
      reduced: reduce,
      talking: !!speaking,
      listening: !!listening,
      thinking: !!thinking,
      oops: !!oops,
      facing: dir,
      shadow: perch !== false,
      thinkingDots: thinkingDots !== false,
      confetti: confettiOn,
      tassel: tiny ? 'still' : 'live',
      moodHold: !!moodHold,
    }
    L.onMoodEnd = onMoodEnd || null
    // The per-frame work, shared by the loop and the one-off paints.
    L.paint = (now) => {
      const host = hostRef.current
      if (!host || !L.parts) return
      // Belt: if anything ever replaced the SVG under us, re-find the parts.
      if (L.parts.root && !L.parts.root.isConnected) {
        L.parts = collectParts(host)
        L.cache = {}
      }
      const { pose, state: s, moodEnded } = L.animator.update(now, { ...L.inputs, mood: L.mood, travel: L.travel, blinkStart: L.blinkStart })
      writePose(L.parts, pose, L.cache)
      if (s !== L.state) {
        L.state = s
        host.setAttribute('data-scholar-state', s)
      }
      if (moodEnded && L.onMoodEnd) L.onMoodEnd(moodEnded)
    }
  })

  // (Re)bind the parts whenever the markup changes, and paint once — so a
  // paused, off-screen or reduced-motion owl still shows the right pose.
  useLayoutEffect(() => {
    const L = live.current
    L.parts = collectParts(hostRef.current)
    L.cache = {}
    L.state = null
    L.paint(nowMs())
  }, [markup])

  // One-shot requests: `mood` (+ moodKey) and the rising edge of `celebrate`.
  useLayoutEffect(() => {
    const L = live.current
    if (mood) L.mood = { name: mood, key: `${moodKey ?? ''}#${++L.moodSeq}` }
    // A held mood ends with its prop (see moodHold above).
    else if (moodHold) L.mood = null
  }, [mood, moodKey, moodHold])
  useLayoutEffect(() => {
    const L = live.current
    if (celebrate) L.mood = { name: 'celebrate', key: `c#${++L.moodSeq}` }
  }, [celebrate])
  useLayoutEffect(() => {
    if (blink) live.current.blinkStart = nowMs()
  }, [blink])

  // Out of the loop (paused / reduced motion), repaint once per prop change.
  useLayoutEffect(() => {
    if (reduce || paused) live.current.paint(nowMs())
  })

  // Join the shared loop (never under reduced motion). `paused` is applied by
  // the next effect without re-joining.
  const entryRef = useRef(null)
  const pausedRef = useRef(paused)
  useEffect(() => {
    pausedRef.current = paused
    if (entryRef.current) scholarTicker().set(entryRef.current, { paused })
  }, [paused])
  useEffect(() => {
    if (reduce) return undefined
    const host = hostRef.current
    const L = live.current
    const entry = {
      el: host,
      paused: pausedRef.current,
      read() {
        if (READS_BOX.has(L.state)) {
          const r = host.getBoundingClientRect()
          L.travel = { x: r.left, y: r.top }
        } else L.travel = null
      },
      write(now) {
        L.paint(now)
      },
    }
    entryRef.current = entry
    const leave = scholarTicker().add(entry)
    return () => {
      leave()
      entryRef.current = null
    }
  }, [reduce])

  return (
    <span
      ref={hostRef}
      aria-hidden="true"
      data-kyro-state={phase}
      data-kyro-facing={dir < 0 ? 'left' : dir > 0 ? 'right' : 'front'}
      data-kyro-active={active ? 'true' : undefined}
      data-scholar-tone={dark ? 'dark' : 'light'}
      data-scholar-variant={tiny ? 'tiny' : 'full'}
      data-scholar-reduced={reduce ? 'true' : undefined}
      className={className}
      style={{
        '--kyro-h': `var(--kyro-size, ${size}px)`,
        display: 'block',
        position: 'relative',
        flexShrink: 0,
        width: `calc(var(--kyro-h) * ${ASPECT.toFixed(4)})`,
        height: 'var(--kyro-h)',
        ...style,
      }}
      dangerouslySetInnerHTML={html}
    />
  )
}
