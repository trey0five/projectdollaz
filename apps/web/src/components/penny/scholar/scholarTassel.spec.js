import { describe, it, expect } from 'vitest'
import { capFrame, hangAngle, createTassel, stepTassel, createTasselSim, partMatrix, TASSEL } from './core/scholarTassel.js'
import { poseAt, timelinePose, createScholarAnimator } from './core/scholarEval.js'
import { transformAttr, TASSEL_PIVOT } from './core/scholarArt.js'

// ─────────────────────────────────────────────────────────────────────────────
// The tassel: hangs straight at rest, lags the right way when the owl moves,
// never swings past its clamp, works in the owl's own frame (so a mirrored owl
// cannot swing it the wrong way), and can be rewound for the film.
// ─────────────────────────────────────────────────────────────────────────────

/** World angle of the hanging tassel from straight down (deg; + = bottom swung right). */
function worldSwing(pose, tasselDeg) {
  // tassel world rotation = cap rotation + the tassel's own rotation (both deg).
  const capDeg = (capFrame(pose).rot * 180) / Math.PI
  const total = capDeg + tasselDeg
  // rotate(+θ) moves a downward vector's tip toward −x (SVG y down)
  return -total
}

describe('capFrame — the cap measured in code', () => {
  it('composes the same matrices the SVG writes', () => {
    const p = { x: 3, y: -4, r: 17, sx: 1.1, sy: 0.9 }
    const m = partMatrix('head', p)
    // transformAttr renders translate(pivot+off) rotate scale translate(−pivot)
    expect(transformAttr('head', p)).toBe('translate(133 156) rotate(17) scale(1.1 0.9) translate(-130 -160)')
    // the pivot moves exactly by the offset
    const [ox, oy] = [130, 160]
    expect(m[0] * ox + m[2] * oy + m[4]).toBeCloseTo(ox + 3, 9)
    expect(m[1] * ox + m[3] * oy + m[5]).toBeCloseTo(oy - 4, 9)
  })

  it('reports the static −10° tilt at rest, and follows the head', () => {
    const rest = capFrame(poseAt('still', 0))
    expect((rest.rot * 180) / Math.PI).toBeCloseTo(-10, 6)
    const tilted = poseAt('still', 0)
    tilted.parts.head.r = 8
    expect((capFrame(tilted).rot * 180) / Math.PI).toBeCloseTo(-2, 6)
  })
})

describe('pendulum', () => {
  it('hangs straight down at rest (no breeze), in any cap tilt', () => {
    const pose = poseAt('still', 0)
    const ph = createTassel()
    let deg = 0
    for (let i = 0; i < 400; i++) deg = stepTassel(ph, capFrame(pose), 1 / 60, i / 60, 0)
    expect(Math.abs(worldSwing(pose, deg))).toBeLessThan(0.01)
    expect(deg).toBeCloseTo(hangAngle(capFrame(pose)), 6)
  })

  it('lags behind when the owl accelerates (moving right → swings left)', () => {
    const pose = poseAt('still', 0)
    const cap = capFrame(pose)
    const ph = createTassel()
    stepTassel(ph, cap, 1 / 60, 0, 0, { x: 0, y: 0 })
    let deg = 0
    for (let i = 1; i <= 8; i++) {
      const t = i / 60
      deg = stepTassel(ph, cap, 1 / 60, t, 0, { x: 1500 * t * t, y: 0 }) // a = 3000 px/s² to the right
    }
    expect(worldSwing(pose, deg)).toBeLessThan(-5)
    // and the mirror image swings the mirror way
    const ph2 = createTassel()
    stepTassel(ph2, cap, 1 / 60, 0, 0, { x: 0, y: 0 })
    let deg2 = 0
    for (let i = 1; i <= 8; i++) {
      const t = i / 60
      deg2 = stepTassel(ph2, cap, 1 / 60, t, 0, { x: -1500 * t * t, y: 0 })
    }
    expect(worldSwing(pose, deg2)).toBeCloseTo(-worldSwing(pose, deg), 6)
  })

  it('stays clamped however hard it is shaken', () => {
    const pose = poseAt('still', 0)
    const cap = capFrame(pose)
    const ph = createTassel()
    for (let i = 0; i < 600; i++) {
      const t = i / 60
      stepTassel(ph, cap, 1 / 60, t, 5, { x: Math.sin(t * 40) * 4000, y: Math.cos(t * 33) * 4000 })
      expect(Math.abs(ph.phi)).toBeLessThanOrEqual(TASSEL.limit + 1e-12)
    }
  })

  it('a mirrored flight swings the tassel the same way on screen', () => {
    // Fly right unmirrored vs fly left mirrored: in the owl's own frame both are
    // "forward", so the local tassel angle must be identical.
    const angles = (dir) => {
      const a = createScholarAnimator({ seed: 1 })
      let last
      for (let t = 0; t <= 600; t += 16) {
        last = a.update(t, { phase: 'flying', facing: dir, travel: { x: dir * 0.004 * t * t, y: 0 } })
      }
      return last.pose.tassel
    }
    expect(angles(1)).toBeCloseTo(angles(-1), 6)
  })
})

describe('createTasselSim — rewindable for the film', () => {
  it('gives the same angle whatever order frames are asked for', () => {
    const ev = [{ t: 0, state: 'idle' }, { t: 600, state: 'hello' }, { t: 2600, state: 'celebrate' }]
    const poseFn = (t) => timelinePose(ev, t)
    const ts = [3100, 400, 2650, 1200, 3100, 10]
    const fwd = createTasselSim(poseFn)
    const a = ts.map((t) => fwd.at(t))
    const fresh = ts.map((t) => createTasselSim(poseFn).at(t))
    a.forEach((v, i) => expect(v).toBeCloseTo(fresh[i], 9))
  })

  it('moves during a celebrate hop (the follow-through is alive)', () => {
    const poseFn = (t) => poseAt('celebrate', t)
    const sim = createTasselSim(poseFn)
    const vals = [200, 500, 800, 1100].map((t) => sim.at(t) - (-(capFrame(poseFn(t)).rot * 180) / Math.PI))
    expect(Math.max(...vals.map(Math.abs))).toBeGreaterThan(2)
    expect(TASSEL_PIVOT).toEqual([183, 45])
  })
})
