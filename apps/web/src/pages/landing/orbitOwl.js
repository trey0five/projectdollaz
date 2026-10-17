// ─────────────────────────────────────────────────────────────────────────────
// orbitOwl — what the Scholar does on the ORBIT set-piece, as PURE functions of
// scroll progress. Nothing here is stored or timed: OrbitScrolly feeds in the
// scroll positions and gets back where the owl is and what it is doing, so
// scrubbing backwards plays the story backwards (the owl takes off again and
// flies back out the way it came).
//
// Two progress values drive it:
//   a  APPROACH, 0→1 while the orbit's track scrolls up from the bottom of the
//      viewport to the top (the moment the stage pins). The owl flies in on an
//      arc from off the left edge, glides the last stretch, and lands on the
//      core as the stage pins.
//   v  ORBIT, 0→1 over the pinned track (the same progress the planets use):
//        0.00–0.04  arrive      — idle on the core (its own landing plays)
//        0.04–0.10  hello       — a wave while the planets erupt
//        0.10–0.90  eight docks — per dock: LISTENING as the planet arrives
//                   (it hands its numbers over the beam), TALKING while it is
//                   docked (its briefing line is read out), THINKING in transit.
//                   The first and last docks get the same listen + talk
//                   windows as the rest (the dock range is padded at both ends)
//        0.90–1.00  celebrate   — every domain is in: a one-shot cap toss as
//                   the system collapses into the morning briefing
// ─────────────────────────────────────────────────────────────────────────────

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x))
const seg = (p, a, b) => clamp((p - a) / (b - a), 0, 1)

/** Where in the approach the flight starts / touches down, and the glide. */
export const FLIGHT = Object.freeze({ start: 0.5, end: 0.96, glideFrom: 0.8 })

/** Flight progress 0→1 for an approach progress `a`. */
export const flightProgress = (a) => seg(a, FLIGHT.start, FLIGHT.end)

/**
 * Where a flight left hanging should finish, or null when it is not hanging:
 * a visitor who stops scrolling mid-arc (a nav anchor lands there) never
 * leaves the owl flapping in mid-air — after FLIGHT_IDLE_MS it lands on the
 * core (scrolling down) or flies back out (scrolling up).
 */
export const FLIGHT_IDLE_MS = 600
export const settleTarget = (f, dir = 1) => (f > 0 && f < 1 ? (dir >= 0 ? 1 : 0) : null)
/** How long the finishing flight takes for the distance left (s). */
export const settleDuration = (f, to) => 0.3 + 0.5 * Math.abs(to - f)

/**
 * The owl's flight phase. `dir` is the scroll direction (1 down, -1 up):
 * scrolling down it flies, then glides in; scrolling back up it takes off and
 * flies (no backwards glide).
 */
export function flightPhase(f, dir = 1) {
  if (f >= 1) return 'perched'
  if (dir >= 0 && f >= FLIGHT.glideFrom) return 'gliding'
  return 'flying'
}

/**
 * The owl's offset from its perch on the core (px) for flight progress `f`:
 * a quadratic arc from just past the left edge of the viewport, swooping up
 * and settling onto the core, slowing for the touchdown. `o` is its opacity
 * (hidden until the flight starts, so it never peeks in from the edge). On a
 * phone the heading wraps taller, so the swoop stays lower to pass under it.
 */
export function flightPoint(f, { vw = 1440, vh = 900, owlW = 100 } = {}) {
  const t = 1 - (1 - f) * (1 - f) // ease out: slows onto the perch
  const x0 = -(vw / 2 + owlW + 24)
  const y0 = -0.04 * vh
  const x1 = x0 * 0.45
  // A shallow swoop on every width: it stays under the heading and subtitle
  // (a deeper desktop arc crossed the copy for a reader who paused mid-flight).
  const y1 = (vw < 640 ? -0.06 : -0.08) * vh
  const u = 1 - t
  return {
    x: u * u * x0 + 2 * u * t * x1,
    y: u * u * y0 + 2 * u * t * y1,
    o: f > 0 ? 1 : 0,
  }
}

/** Scroll moves smaller than this never turn the owl around (layout jitter). */
export const TURN_HYSTERESIS = 0.004

/**
 * The direction the owl travels, with hysteresis: `track` is { dir, anchor }
 * from the last call (start with { dir: 1, anchor: a }). It turns only once the
 * scroll has moved TURN_HYSTERESIS the other way, so a one-pixel layout shift
 * never flips it mid-flight. Returns the new { dir, anchor }.
 */
export function travelDir(track, a) {
  const { dir, anchor } = track
  if (dir >= 0) {
    if (a >= anchor) return { dir: 1, anchor: a }
    return anchor - a > TURN_HYSTERESIS ? { dir: -1, anchor: a } : track
  }
  if (a <= anchor) return { dir: -1, anchor: a }
  return a - anchor > TURN_HYSTERESIS ? { dir: 1, anchor: a } : track
}

const DOCKS = 8
/** Each dock's beats span x ∈ [k − 0.3, k + 0.3]; the range is padded by that
 *  much at both ends so the first and last docks get full windows too. */
const DOCK_PAD = 0.3

/** The owl's beat on the pinned orbit for progress `v` (a stable key). */
export function orbitBeat(v) {
  if (v < 0.04) return 'arrive'
  if (v < 0.1) return 'hello'
  if (v >= 0.9) return 'celebrate'
  const x = seg(v, 0.1, 0.9) * (DOCKS - 1 + 2 * DOCK_PAD) - DOCK_PAD
  const k = clamp(Math.round(x), 0, DOCKS - 1)
  const u = x - k
  if (u < -DOCK_PAD || u > DOCK_PAD) return `think-${u < 0 ? k - 1 : k}`
  if (u < 0.05) return `listen-${k}`
  return `talk-${k}`
}

/**
 * The owl's props for a beat. `wide` = the flanking columns are on screen.
 * Hello and celebrate are HELD moods (moodHold): each lasts only as long as
 * its beat, so the wave never runs over the first docks and scrolling back up
 * from the finale ends the cap toss.
 */
export function beatOwl(beat, { wide = false } = {}) {
  const kind = beat.split('-')[0]
  return {
    listening: kind === 'listen',
    speaking: kind === 'talk',
    thinking: kind === 'think',
    // Talking, it turns toward the "In your morning briefing" column (right).
    facing: kind === 'talk' && wide ? 'right' : undefined,
    mood: kind === 'hello' || kind === 'celebrate' ? kind : null,
    moodHold: true,
  }
}
