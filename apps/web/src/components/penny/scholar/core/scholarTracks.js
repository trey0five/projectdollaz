// ─────────────────────────────────────────────────────────────────────────────
// scholarTracks — every pose and every move of the Scholar, as numbers.
//
// A faithful transcription of the approved mock's S.* state functions and
// POSES table (kyro-owl-mocks/b/index.html). The mock drove the Web Animations
// API; here the same keyframes are DATA so scholarEval.poseAt(state, t) can
// evaluate any moment directly (seekable, frame-exact for the film).
//
// Vocabulary:
//   tr(x, y, r, sx, sy)   a part transform: translate px(units) · rotate deg ·
//                          scale — about the part's pivot (scholarArt.PIVOTS)
//   track                  { p: part, a: 't'|'o', d: ms, k: [[offset, value, ease?]…],
//                            loop?: bool, delay?: ms }
//                          `ease` on a keyframe eases the segment that STARTS
//                          there (WAAPI keyframe easing). A track is active from
//                          `delay`; a non-loop track holds its last value after
//                          it ends (fill: forwards). Later tracks win (composite
//                          replace), exactly like the mock's animation stack.
//   state                  { dur, loop, breeze, base, enter, tracks }
//                          base   the resting pose the tracks sit on (the mock's
//                                 To(...) targets)
//                          enter  per-part blend-in [ms, ease, delay] from
//                                 whatever pose the owl was in (the mock's To
//                                 durations/easings); parts not listed blend in
//                                 over BLEND_MS with EOUT
//                          breeze tassel idle sway gain (mock o.breeze)
//
// Departures from the mock (all owner-approved defaults, PLAN §6 decisions 1–2):
//   - listening keeps the lean, brows and tuft perk but has NO rings;
//   - flying is only the wingbeat — the flight engine (Penny.jsx / the film
//     path) does the travelling — and `gliding` + `landing` are split out of
//     the mock's single flying cycle so the engine's phases map 1:1;
//   - celebrate is a ONE-SHOT in the app (a cap toss), so its happy eyes hold
//     to the end instead of looping;
//   - `still` is the reduced-motion owl: the neutral idle pose, nothing moving;
//   - TINY (≤36px) is a variant of the art plus TINY_RULES below, not new poses.
// ─────────────────────────────────────────────────────────────────────────────

export const tr = (x = 0, y = 0, r = 0, sx = 1, sy = sx) => ({ x, y, r, sx, sy })
export const I = tr()

/** Default blend between states (the mock's stop(): 260ms ease-out). */
export const BLEND_MS = 260
export const BLEND_EASE = 'EOUT'

// Named poses the mock reused.
const CHIN = tr(-24, 18, -92)
const SCRATCH = tr(6, 30, 160)
const CAPHOLD = tr(2, 0, 180)

/** Both eyes (or one) closed into a happy arc — the mock's `happy` flag. */
const happyBase = (side) => {
  const out = {}
  if (side === 'both' || side === 'L') Object.assign(out, { eyeOpenL: 0, happyL: 1 })
  if (side === 'both' || side === 'R') Object.assign(out, { eyeOpenR: 0, happyR: 1 })
  return out
}

/** The mock's happy(o, dur, frames): eyes-open fades out as the arcs fade in. */
const happyTracks = (d, frames, opt = {}) => [
  { p: 'eyeOpenL', a: 'o', d, k: frames.map(([o, v]) => [o, 1 - v]), ...opt },
  { p: 'eyeOpenR', a: 'o', d, k: frames.map(([o, v]) => [o, 1 - v]), ...opt },
  { p: 'happyL', a: 'o', d, k: frames.map(([o, v]) => [o, v]), ...opt },
  { p: 'happyR', a: 'o', d, k: frames.map(([o, v]) => [o, v]), ...opt },
]
const both = (a, b, d, k, opt = {}) => [
  { p: a, d, k, ...opt },
  { p: b, d, k, ...opt },
]
/** Mirror a wing track (rotate and x-translate negated) — the mock's mirror(). */
const mirror = (k) => k.map(([o, t, e]) => [o, { ...t, x: -t.x, r: -t.r }, e])

/** Breathing: the mock's alternate 1700ms EIO, unrolled to a 3400ms loop. */
const BREATHE = { p: 'breath', d: 3400, loop: true, k: [[0, I, 'EIO'], [0.5, tr(0, 0, 0, 0.988, 1.018), 'EIO'], [1, I]] }

const loop = (tracks) => tracks.map((t) => ({ loop: true, ...t }))

// ── idle ───────────────────────────────────────────────────────────────────
const IDLE_D = 6400
const idle = {
  dur: IDLE_D,
  loop: true,
  breeze: 1,
  tracks: loop([
    BREATHE,
    ...both('pupilL', 'pupilR', IDLE_D, [
      [0, I], [0.26, I, 'EOUT'], [0.3, tr(-6, 1)], [0.44, tr(-6, 1), 'EOUT'], [0.48, tr(5, -1)],
      [0.6, tr(5, -1), 'EOUT'], [0.64, I], [1, I],
    ]),
    { p: 'head', d: IDLE_D, k: [
      [0, I], [0.26, I, 'EIO'], [0.32, tr(0, 0, -3)], [0.44, tr(0, 0, -3), 'EIO'], [0.5, tr(0, 0, 3)],
      [0.6, tr(0, 0, 3), 'EIO'], [0.66, I], [0.83, I, 'EOUT'], [0.86, tr(0, -1.5, -1.5)], [0.92, I, 'EIO'], [1, I],
    ] },
    // the glasses slowly slip, then get pushed back up with a wing
    { p: 'glasses', d: IDLE_D, k: [
      [0, I], [0.8, tr(0, 3.5)], [0.845, tr(0, 3.5), 'EOUT'], [0.875, tr(0, -2.5), 'EB'], [0.95, I], [1, I],
    ] },
    { p: 'wingR', d: IDLE_D, k: [
      [0, I], [0.76, I, 'EOUT'], [0.83, tr(26, 16, 119, 0.86)], [0.845, tr(26, 16, 119, 0.86), 'EOUT'],
      [0.875, tr(26, 9, 119, 0.86)], [0.89, tr(26, 9, 119, 0.86), 'EB'], [0.97, I], [1, I],
    ] },
    ...both('eyeOpenL', 'eyeOpenR', IDLE_D, [
      [0, I], [0.82, I, 'EOUT'], [0.85, tr(0, 0, 0, 1, 0.7)], [0.89, tr(0, 0, 0, 1, 0.7), 'EOUT'], [0.94, I], [1, I],
    ]),
    ...both('browL', 'browR', IDLE_D, [
      [0, I], [0.28, I, 'EB'], [0.32, tr(0, -3)], [0.42, tr(0, -3), 'EIO'], [0.48, I], [0.845, I, 'EB'],
      [0.88, tr(0, -4)], [0.93, I, 'EIO'], [1, I],
    ]),
    { p: 'tuftR', d: IDLE_D, k: [[0, I], [0.5, I, 'EOUT'], [0.53, tr(0, -2, 10)], [0.57, I, 'EB'], [1, I]] },
  ]),
}

// ── hello (one-shot mood: a hop, a wave, a tip of the cap) ────────────────
const HELLO_D = 3700
const hello = {
  dur: HELLO_D,
  loop: false,
  breeze: 1,
  tracks: [
    BREATHE,
    { p: 'squash', d: HELLO_D, k: [
      [0, I, 'EIO'], [0.05, tr(0, 0, 0, 1.07, 0.92), 'EOUT'], [0.12, tr(0, 0, 0, 0.95, 1.07), 'EIO'],
      [0.19, tr(0, 0, 0, 1.06, 0.95), 'EOUT'], [0.25, I], [0.6, I, 'EIO'], [0.64, tr(0, 0, 0, 1.02, 0.98)], [0.7, I], [1, I],
    ] },
    { p: 'root', d: HELLO_D, k: [[0, I], [0.05, I, 'EOUT'], [0.12, tr(0, -16), 'EIN'], [0.19, I, 'EB'], [1, I]] },
    { p: 'wingR', d: HELLO_D, k: [
      [0, I], [0.06, I, 'EOUT'], [0.14, tr(0, 0, -150), 'EIO'], [0.21, tr(0, 0, -122), 'EIO'], [0.28, tr(0, 0, -155), 'EIO'],
      [0.35, tr(0, 0, -122), 'EIO'], [0.42, tr(0, 0, -152), 'EIO'], [0.5, tr(0, 0, -140), 'EIO'],
      [0.58, tr(-4, -4, -172), 'EOUT'], [0.64, tr(-6, -20, -174), 'EIO'], [0.78, tr(-6, -20, -174), 'EIO'],
      [0.84, tr(-4, -4, -172), 'EOUT'], [0.92, I, 'EB'], [1, I],
    ] },
    { p: 'wingL', d: HELLO_D, k: [[0, I], [0.08, I, 'EOUT'], [0.14, tr(0, 0, 14), 'EIO'], [0.5, tr(0, 0, 10), 'EIO'], [0.58, I], [1, I]] },
    { p: 'cap', d: HELLO_D, k: [
      [0, I], [0.6, I, 'EOUT'], [0.66, tr(6, -22, 16)], [0.78, tr(6, -22, 16), 'EIN'], [0.84, I], [0.87, tr(0, 2, -3)], [0.91, I, 'EIO'], [1, I],
    ] },
    { p: 'head', d: HELLO_D, k: [
      [0, I], [0.12, I, 'EIO'], [0.2, tr(0, 0, 4)], [0.5, tr(0, 0, 4), 'EIO'], [0.6, I], [0.62, I, 'EIO'],
      [0.7, tr(0, 5, -5)], [0.8, tr(0, 5, -5), 'EIO'], [0.9, I], [1, I],
    ] },
    ...happyTracks(HELLO_D, [[0, 0], [0.1, 0], [0.12, 1], [0.5, 1], [0.52, 0], [0.66, 0], [0.68, 1], [0.82, 1], [0.84, 0], [1, 0]]),
    ...both('browL', 'browR', HELLO_D, [[0, I], [0.08, I, 'EB'], [0.14, tr(0, -6)], [0.5, tr(0, -6), 'EIO'], [0.56, I], [1, I]]),
    { p: 'lowerBeak', d: HELLO_D, k: [
      [0, I], [0.1, I, 'EOUT'], [0.14, tr(0, 6)], [0.19, tr(0, 2)], [0.23, tr(0, 6)], [0.3, tr(0, 1)], [0.5, tr(0, 1)], [0.56, I], [1, I],
    ] },
    ...both('cheekL', 'cheekR', HELLO_D, [[0, I], [0.1, I, 'EB'], [0.15, tr(0, 0, 0, 1.15)], [0.5, tr(0, 0, 0, 1.15)], [0.56, I], [1, I]]),
  ],
}

// ── talking (narrating) ─────────────────────────────────────────────────────
const TALK_D = 2800
const LB = [[0, 0], [0.04, 6], [0.09, 1], [0.13, 5], [0.18, 0], [0.24, 0], [0.28, 6], [0.33, 2], [0.37, 6], [0.42, 0], [0.53, 0],
  [0.57, 4], [0.62, 1], [0.67, 6], [0.72, 0], [0.8, 0], [0.84, 5], [0.88, 1], [0.92, 4], [0.96, 0], [1, 0]]
const talking = {
  dur: TALK_D,
  loop: true,
  breeze: 1,
  tracks: loop([
    BREATHE,
    { p: 'lowerBeak', d: TALK_D, k: LB.map(([a, v]) => [a, tr(0, v), 'EIO']) },
    { p: 'upperBeak', d: TALK_D, k: LB.map(([a, v]) => [a, tr(0, -v * 0.18), 'EIO']) },
    { p: 'root', d: TALK_D, k: [
      [0, I], [0.04, tr(0, -3)], [0.1, I], [0.28, tr(0, -3)], [0.36, tr(0, -2)], [0.44, I], [0.57, tr(0, -2)],
      [0.67, tr(0, -3)], [0.74, I], [0.84, tr(0, -2)], [0.96, I], [1, I],
    ].map((f) => [f[0], f[1], 'EIO']) },
    { p: 'wingL', d: TALK_D, k: [
      [0, I, 'EB'], [0.1, tr(0, 0, 48), 'EIO'], [0.26, tr(0, 0, 36), 'EIO'], [0.4, tr(0, 0, 54), 'EIO'],
      [0.56, tr(0, 0, 30), 'EIO'], [0.7, tr(0, 0, 46), 'EIO'], [0.86, tr(0, 0, 14), 'EIO'], [1, I],
    ] },
    { p: 'head', d: TALK_D, k: [[0, I], [0.25, tr(0, 0, -2.5)], [0.5, tr(0, 0, 2)], [0.75, tr(0, 0, -1.5)], [1, I]].map((f) => [f[0], f[1], 'EIO']) },
    ...both('browL', 'browR', TALK_D, [
      [0, I], [0.24, I, 'EB'], [0.28, tr(0, -4)], [0.4, tr(0, -4), 'EIO'], [0.46, I], [0.63, I, 'EB'],
      [0.67, tr(0, -5)], [0.76, tr(0, -5), 'EIO'], [0.82, I], [1, I],
    ]),
    ...both('pupilL', 'pupilR', TALK_D, [[0, I], [0.46, I, 'EOUT'], [0.5, tr(-4, 3)], [0.6, tr(-4, 3), 'EOUT'], [0.64, I], [1, I]]),
    { p: 'wingR', d: TALK_D, k: [[0, I], [0.38, I, 'EIO'], [0.48, tr(0, 0, -12)], [0.6, I, 'EIO'], [1, I]] },
  ]),
}

// ── listening (leans in, brows up, all ears — NO rings) ───────────────────
const LISTEN_D = 3000
const listening = {
  dur: LISTEN_D,
  loop: true,
  breeze: 1,
  base: {
    root: tr(0, 5, -3, 1.045),
    head: tr(0, 0, -7),
    browL: tr(0, -7),
    browR: tr(0, -7),
    pupilL: tr(0, 0, 0, 1.16),
    pupilR: tr(0, 0, 0, 1.16),
    tuftL: tr(0, -3, -12),
    tuftR: tr(0, -3, 12),
  },
  enter: {
    root: [520, 'EB'], head: [520, 'EB'], browL: [420, 'EB'], browR: [420, 'EB'],
    pupilL: [420, 'EB'], pupilR: [420, 'EB'], tuftL: [460, 'EB2'], tuftR: [460, 'EB2'],
  },
  tracks: loop([
    BREATHE,
    { p: 'head', d: LISTEN_D, delay: 520, k: [
      [0, tr(0, 0, -7)], [0.4, tr(0, 0, -7), 'EIO'], [0.48, tr(0, 4, -7), 'EIO'], [0.56, tr(0, 0, -7), 'EIO'],
      [0.63, tr(0, 3, -7), 'EIO'], [0.71, tr(0, 0, -7)], [1, tr(0, 0, -7)],
    ] },
    { p: 'tuftR', d: LISTEN_D, delay: 520, k: [[0, tr(0, -3, 12)], [0.2, tr(0, -3, 12), 'EOUT'], [0.24, tr(0, -4, 20)], [0.3, tr(0, -3, 12), 'EB'], [1, tr(0, -3, 12)]] },
    { p: 'lowerBeak', d: LISTEN_D, delay: 520, k: [[0, I], [0.46, I, 'EIO'], [0.5, tr(0, 2)], [0.54, I], [1, I]] },
  ]),
}

// ── thinking (taps the chin, eyes up, the "…" cloud) ──────────────────────
const THINK_D = 3000
const DOT_K_T = [[0, I], [0.25, tr(0, -4), 'EIO'], [0.55, I], [1, I]]
const DOT_K_O = [[0, 0.3], [0.25, 1, 'EIO'], [0.55, 0.3], [1, 0.3]]
const thinking = {
  dur: THINK_D,
  loop: true,
  breeze: 1,
  base: {
    wingL: CHIN,
    pupilL: tr(6, -8),
    pupilR: tr(6, -8),
    browR: tr(0, -7, -6),
    browL: tr(0, 3, 6),
    head: tr(0, 0, 6),
    lowerBeak: tr(1.5, 1),
    dots: tr(0, 6, 0, 0.6),
  },
  opacity: { dots: 0 },
  enter: {
    wingL: [520, 'EB'], pupilL: [380, 'EOUT'], pupilR: [380, 'EOUT'], browR: [420, 'EB'], browL: [420, 'EB'],
    head: [520, 'EB'], lowerBeak: [300, 'EB'], dots: [1, 'linear'],
  },
  tracks: [
    BREATHE,
    { p: 'dots', d: 460, delay: 280, k: [[0, tr(0, 6, 0, 0.6), 'EB'], [1, I]] },
    { p: 'dots', a: 'o', d: 460, delay: 280, k: [[0, 0, 'EB'], [1, 1]] },
    ...loop([
      { p: 'wingL', d: THINK_D, delay: 600, k: [[0, CHIN, 'EIO'], [0.07, tr(-24, 18, -85), 'EIO'], [0.14, CHIN, 'EIO'], [0.21, tr(-24, 18, -85), 'EIO'], [0.28, CHIN], [1, CHIN]] },
      ...both('pupilL', 'pupilR', THINK_D, [[0, tr(6, -8), 'EIO'], [0.5, tr(2, -9), 'EIO'], [1, tr(6, -8)]], { delay: 400 }),
      { p: 'head', d: THINK_D, delay: 520, k: [[0, tr(0, 0, 6), 'EIO'], [0.5, tr(0, 0, 8), 'EIO'], [1, tr(0, 0, 6)]] },
      ...['dot1', 'dot2', 'dot3'].flatMap((p, i) => [
        { p, d: 1200, delay: 500 + i * 160, k: DOT_K_T },
        { p, a: 'o', d: 1200, delay: 500 + i * 160, k: DOT_K_O },
      ]),
    ]),
  ],
}

// ── celebrate (squash, stretch, cap toss — a one-shot in the app) ─────────
const CEL_D = 2600
const CEL_WING = [[0, I], [0.1, tr(0, 0, -12), 'EOUT'], [0.18, tr(0, 0, 118), 'EIO'], [0.26, tr(0, 0, 96), 'EIO'], [0.34, tr(0, 0, 122), 'EIO'],
  [0.42, tr(0, 0, 100), 'EIN'], [0.5, tr(0, 0, 40), 'EB'], [0.62, I], [1, I]]
const celebrate = {
  dur: CEL_D,
  loop: false,
  breeze: 0.3,
  // When the confetti bursts, as a fraction of dur (the mock: D × .17).
  confettiAt: 0.17,
  base: {
    lowerBeak: tr(0, 6),
    browL: tr(0, -6),
    browR: tr(0, -6),
    cheekL: tr(0, 0, 0, 1.18),
    cheekR: tr(0, 0, 0, 1.18),
  },
  enter: {
    lowerBeak: [300, 'EOUT'], browL: [300, 'EB'], browR: [300, 'EB'], cheekL: [300, 'EB'], cheekR: [300, 'EB'],
  },
  tracks: [
    { p: 'squash', d: CEL_D, k: [
      [0, I, 'EIO'], [0.1, tr(0, 0, 0, 1.15, 0.83), 'EOUT'], [0.17, tr(0, 0, 0, 0.9, 1.13), 'EOUT'], [0.3, I, 'EIN'],
      [0.47, tr(0, 0, 0, 0.95, 1.07), 'EIN'], [0.5, tr(0, 0, 0, 1.16, 0.84), 'EOUT'], [0.58, tr(0, 0, 0, 0.96, 1.05), 'EIO'],
      [0.65, tr(0, 0, 0, 1.02, 0.98), 'EIO'], [0.72, I], [1, I],
    ] },
    { p: 'root', d: CEL_D, k: [[0, I], [0.1, I, 'EOUT'], [0.3, tr(0, -78), 'EIN'], [0.5, I, 'EOUT'], [0.565, tr(0, -9), 'EIN'], [0.63, I], [1, I]] },
    { p: 'shadow', d: CEL_D, k: [
      [0, I], [0.1, tr(0, 0, 0, 1.06), 'EOUT'], [0.3, tr(0, 0, 0, 0.55), 'EIN'], [0.5, tr(0, 0, 0, 1.08), 'EOUT'],
      [0.565, tr(0, 0, 0, 0.92), 'EIN'], [0.63, I], [1, I],
    ] },
    { p: 'wingL', d: CEL_D, k: CEL_WING },
    { p: 'wingR', d: CEL_D, k: mirror(CEL_WING) },
    { p: 'cap', d: CEL_D, k: [
      [0, I], [0.12, I, 'EOUT'], [0.36, tr(6, -108, 200)], [0.44, tr(4, -116, 290), 'EIN'], [0.64, tr(0, 0, 360)],
      [0.675, tr(0, 5, 366), 'EOUT'], [0.74, tr(0, 0, 360)], [1, tr(0, 0, 360)],
    ] },
    { p: 'head', d: CEL_D, k: [
      [0, I], [0.1, tr(0, 4), 'EOUT'], [0.2, tr(0, -4)], [0.3, I, 'EIO'], [0.5, tr(0, 6), 'EOUT'], [0.6, I, 'EIO'],
      [0.64, I, 'EOUT'], [0.68, tr(0, 3)], [0.74, I], [1, I],
    ] },
    ...happyTracks(400, [[0, 0], [1, 1]]),
    { p: 'feet', d: CEL_D, k: [[0, I], [0.12, I, 'EOUT'], [0.22, tr(0, -4, 0, 1, 0.8)], [0.45, tr(0, -4, 0, 1, 0.8), 'EIN'], [0.5, I], [1, I]] },
  ],
}

// ── oops (glasses slip; a sheepish scratch) ───────────────────────────────
const OOPS_D = 3800
const oops = {
  dur: OOPS_D,
  loop: true,
  breeze: 1,
  tracks: loop([
    BREATHE,
    { p: 'glasses', d: OOPS_D, k: [
      [0, I, 'EIN'], [0.06, tr(0, 6, -3), 'EIN'], [0.15, tr(-2, 22, -9), 'EB'], [0.2, tr(-2, 21, -9)],
      [0.8, tr(-2, 21, -9), 'EIO'], [0.86, tr(0, -2), 'EB'], [0.93, I], [1, I],
    ] },
    { p: 'wingR', d: OOPS_D, k: [
      [0, I], [0.72, I, 'EOUT'], [0.79, tr(26, 36, 119, 0.86)], [0.8, tr(26, 36, 119, 0.86), 'EIO'],
      [0.86, tr(26, 11, 119, 0.86)], [0.88, tr(26, 11, 119, 0.86), 'EB'], [0.97, I], [1, I],
    ] },
    { p: 'browL', d: OOPS_D, k: [[0, I], [0.1, I, 'EB'], [0.17, tr(0, -4, -16)], [0.8, tr(0, -4, -16), 'EIO'], [0.88, I], [1, I]] },
    { p: 'browR', d: OOPS_D, k: [[0, I], [0.1, I, 'EB'], [0.17, tr(0, -4, 16)], [0.8, tr(0, -4, 16), 'EIO'], [0.88, I], [1, I]] },
    ...both('pupilL', 'pupilR', OOPS_D, [
      [0, I], [0.12, I, 'EOUT'], [0.18, tr(3, 5)], [0.4, tr(3, 5), 'EOUT'], [0.45, tr(-3, 4)], [0.56, tr(-3, 4), 'EOUT'],
      [0.6, tr(0, -2)], [0.84, tr(0, -2), 'EOUT'], [0.9, I], [1, I],
    ]),
    ...both('eyeOpenL', 'eyeOpenR', OOPS_D, [[0, I], [0.12, I, 'EOUT'], [0.18, tr(0, 0, 0, 1, 0.88)], [0.82, tr(0, 0, 0, 1, 0.88), 'EOUT'], [0.88, I], [1, I]]),
    { p: 'squash', d: OOPS_D, k: [
      [0, I, 'EOUT'], [0.04, tr(0, 0, 0, 0.96, 1.05), 'EIO'], [0.12, tr(0, 0, 0, 1.04, 0.95)], [0.84, tr(0, 0, 0, 1.04, 0.95), 'EB'], [0.92, I], [1, I],
    ] },
    { p: 'head', d: OOPS_D, k: [[0, I], [0.12, I, 'EB'], [0.2, tr(0, 3, -5)], [0.84, tr(0, 3, -5), 'EIO'], [0.92, I], [1, I]] },
    { p: 'wingL', d: OOPS_D, k: [
      [0, I], [0.18, I, 'EOUT'], [0.26, SCRATCH], [0.31, tr(6, 30, 151)], [0.36, tr(6, 30, 166)], [0.41, tr(6, 30, 151)],
      [0.46, tr(6, 30, 165)], [0.51, tr(6, 30, 153)], [0.56, SCRATCH, 'EIO'], [0.66, I, 'EB'], [1, I],
    ] },
    ...both('cheekL', 'cheekR', OOPS_D, [[0, I], [0.12, I, 'EB'], [0.2, tr(0, 0, 0, 1.38)], [0.84, tr(0, 0, 0, 1.38), 'EIO'], [0.92, I], [1, I]]),
    { p: 'sweat', d: OOPS_D, k: [[0, tr(0, -6)], [0.2, tr(0, -6), 'EB'], [0.26, I], [0.6, tr(0, 10), 'EIN'], [0.66, tr(0, 14)], [1, tr(0, 14)]] },
    { p: 'sweat', a: 'o', d: OOPS_D, k: [[0, 0], [0.2, 0, 'EB'], [0.26, 1], [0.6, 1, 'EIN'], [0.66, 0], [1, 0]] },
    { p: 'lowerBeak', d: OOPS_D, k: [[0, I, 'EOUT'], [0.06, tr(0, 4)], [0.16, tr(0, 1.5)], [0.84, tr(0, 1.5)], [0.9, I], [1, I]] },
  ]),
}

// ── flying (the wingbeat only; the engine moves the box) ─────────────────
// One wing beats (150ms each way, the mock's alternate EIO); the other holds the
// cap on. Leans 10° into the direction of travel. The ground shadow is gone.
const FLAP = 300
const flying = {
  dur: FLAP,
  loop: true,
  breeze: 0,
  base: {
    wingL: CAPHOLD,
    feet: tr(0, -5, 0, 1, 0.7),
    pupilL: tr(5, 0),
    pupilR: tr(5, 0),
    browL: tr(0, -3),
    browR: tr(0, -3),
    root: tr(0, 0, 10),
    shadow: tr(0, 0, 0, 0.4),
  },
  opacity: { shadow: 0 },
  enter: {
    wingL: [260, 'EOUT'], feet: [220, 'EOUT'], pupilL: [200, 'EOUT'], pupilR: [200, 'EOUT'], browL: [300, 'EB'],
    browR: [300, 'EB'], root: [300, 'EOUT'], shadow: [240, 'EOUT'], wingR: [90, 'EOUT'], breath: [90, 'EOUT'],
  },
  tracks: loop([
    { p: 'wingR', d: FLAP, k: [[0, tr(0, 0, -22), 'EIO'], [0.5, tr(0, 0, -138), 'EIO'], [1, tr(0, 0, -22)]] },
    { p: 'breath', d: FLAP, k: [[0, tr(0, 2), 'EIO'], [0.5, tr(0, -9, 0, 0.98, 1.03), 'EIO'], [1, tr(0, 2)]] },
  ]),
}

// ── gliding (wings out, no flap — the last ~200ms before touchdown) ──────
const gliding = {
  dur: 200,
  loop: true,
  breeze: 0,
  base: {
    wingL: CAPHOLD,
    wingR: tr(0, 0, -96),
    feet: tr(0, -2, 0, 1, 0.85),
    pupilL: tr(5, 0),
    pupilR: tr(5, 0),
    browL: tr(0, -3),
    browR: tr(0, -3),
    root: tr(0, 0, 4),
    shadow: tr(0, 0, 0, 0.8),
  },
  opacity: { shadow: 0.7 },
  enter: {
    wingR: [160, 'EOUT'], feet: [180, 'EOUT'], root: [200, 'EOUT'], shadow: [200, 'EOUT'], breath: [140, 'EOUT'],
  },
  tracks: [],
}

// ── landing (one-shot touchdown: squash, settle, cap bounce, a glance) ────
const LAND_D = 1600
const landing = {
  dur: LAND_D,
  loop: false,
  breeze: 0.5,
  enter: {
    wingR: [420, 'EB'], wingL: [520, 'EB'], feet: [200, 'EOUT'], breath: [160, 'EOUT'], browL: [300, 'EB'],
    browR: [300, 'EB'], shadow: [180, 'EOUT'], root: [90, 'EOUT'], pupilL: [90, 'EOUT'], pupilR: [90, 'EOUT'],
  },
  tracks: [
    { p: 'root', d: 700, k: [[0, tr(0, 0, -4), 'EOUT'], [0.4, tr(0, 0, 1.5), 'EIO'], [1, I]] },
    { p: 'squash', d: 700, k: [
      [0, I, 'EOUT'], [0.18, tr(0, 0, 0, 1.17, 0.82), 'EOUT'], [0.42, tr(0, 0, 0, 0.95, 1.06), 'EIO'],
      [0.66, tr(0, 0, 0, 1.02, 0.98), 'EIO'], [1, I],
    ] },
    { p: 'cap', d: 800, k: [[0, I], [0.2, tr(0, 6, 4), 'EOUT'], [0.45, tr(0, -3, -2), 'EIO'], [1, I]] },
    ...both('pupilL', 'pupilR', LAND_D, [
      [0, tr(5, 0), 'EOUT'], [0.12, I], [0.4, I, 'EOUT'], [0.48, tr(-5, 1)], [0.7, tr(-5, 1), 'EOUT'], [0.78, I], [1, I],
    ]),
    ...happyTracks(1500, [[0, 0], [0.28, 0], [0.31, 1], [0.6, 1], [0.63, 0], [1, 0]]),
  ],
}

// ── static expressions (the mock's POSES; stickers + one-shot holds) ──────
export const POSES = Object.freeze({
  idle: {},
  hello: { wingR: tr(0, 0, -145), happy: 'both', browL: tr(0, -5), browR: tr(0, -5), lowerBeak: tr(0, 4), cheekL: tr(0, 0, 0, 1.12), cheekR: tr(0, 0, 0, 1.12) },
  talking: { lowerBeak: tr(0, 5), upperBeak: tr(0, -1), wingL: tr(0, 0, 45), browL: tr(0, -3), browR: tr(0, -3) },
  listening: { root: tr(0, 4, -3, 1.04), head: tr(0, 0, -7), browL: tr(0, -7), browR: tr(0, -7), pupilL: tr(0, 0, 0, 1.16), pupilR: tr(0, 0, 0, 1.16), tuftL: tr(0, -3, -12), tuftR: tr(0, -3, 12) },
  thinking: { wingL: CHIN, pupilL: tr(6, -8), pupilR: tr(6, -8), browR: tr(0, -7, -6), browL: tr(0, 3, 6), head: tr(0, 0, 6), dots: { t: I, o: 1 } },
  celebrate: { wingL: tr(0, 0, 116), wingR: tr(0, 0, -116), happy: 'both', lowerBeak: tr(0, 6), cap: tr(4, -30, 16), root: tr(0, -8), browL: tr(0, -6), browR: tr(0, -6), cheekL: tr(0, 0, 0, 1.15), cheekR: tr(0, 0, 0, 1.15) },
  oops: { glasses: tr(-2, 21, -9), browL: tr(0, -4, -16), browR: tr(0, -4, 16), cheekL: tr(0, 0, 0, 1.35), cheekR: tr(0, 0, 0, 1.35), wingL: SCRATCH, sweat: { t: tr(0, 4), o: 1 }, head: tr(0, 3, -5), lowerBeak: tr(0, 2), pupilL: tr(0, -2), pupilR: tr(0, -2), eyeOpenL: tr(0, 0, 0, 1, 0.9), eyeOpenR: tr(0, 0, 0, 1, 0.9) },
  flying: { wingR: tr(0, 0, -120), wingL: CAPHOLD, feet: tr(0, -5, 0, 1, 0.7), root: tr(0, -14, 8), pupilL: tr(5, 0), pupilR: tr(5, 0) },
  wink: { happy: 'L', lowerBeak: tr(0, 3), browL: tr(0, 2, 6), browR: tr(0, -5), head: tr(0, 0, -5), wingR: tr(0, 0, -58), cheekL: tr(0, 0, 0, 1.15), cheekR: tr(0, 0, 0, 1.15) },
  whoa: { pupilL: tr(0, 0, 0, 0.7), pupilR: tr(0, 0, 0, 0.7), eyeOpenL: tr(0, 0, 0, 1.07), eyeOpenR: tr(0, 0, 0, 1.07), browL: tr(0, -11, -4), browR: tr(0, -11, 4), lowerBeak: tr(0, 7), glasses: tr(0, -5), tuftL: tr(0, -4, -14), tuftR: tr(0, -4, 14), wingL: tr(0, 0, 28), wingR: tr(0, 0, -28), squash: tr(0, 0, 0, 0.97, 1.04) },
})

/** A POSES entry as a state's base/opacity pair. */
export function poseToBase(pose) {
  const base = {}
  const opacity = {}
  for (const [k, v] of Object.entries(pose || {})) {
    if (k === 'happy') {
      Object.assign(opacity, happyBase(v))
      continue
    }
    if (v && (v.t || v.o != null) && v.sx === undefined) {
      if (v.t) base[k] = v.t
      if (v.o != null) opacity[k] = v.o
    } else base[k] = v
  }
  return { base, opacity }
}

/** A held expression: blend in, hold, then the owl moves on (moods wink/whoa). */
const hold = (name, dur) => {
  const { base, opacity } = poseToBase(POSES[name])
  const enter = {}
  for (const k of Object.keys(base)) enter[k] = [320, 'EB']
  return { dur, loop: false, breeze: 1, base, opacity, enter, tracks: [BREATHE] }
}

// ── reduced motion: the neutral owl, nothing moving ───────────────────────
const still = { dur: 1, loop: true, breeze: 0, still: true, tracks: [] }

export const STATES = Object.freeze({
  idle,
  perched: idle, // the flight engine's resting phase
  hello,
  talking,
  listening,
  thinking,
  celebrate,
  oops,
  flying,
  gliding,
  landing,
  wink: hold('wink', 1500),
  whoa: hold('whoa', 1500),
  still,
})

/** One-shot expressions a caller can fire with `mood` (or that props trigger). */
export const MOODS = Object.freeze(['hello', 'celebrate', 'oops', 'wink', 'whoa'])

/** States where the owl is in the air (mirrors to face its travel). */
export const AIRBORNE = Object.freeze(['flying', 'gliding'])

/**
 * The tiny owl (≤36px): art changes live in scholarArt (tiny: thicker
 * spectacles, no chevrons/glints); these are its motion rules.
 */
export const TINY_PX = 36
export const TINY_RULES = Object.freeze({ tassel: 'still', confetti: false })

/** Confetti only on owls at least this tall. */
export const CONFETTI_MIN_PX = 96
