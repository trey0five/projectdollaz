// ─────────────────────────────────────────────────────────────────────────────
// KyroDove — KYRO, the photoreal LITTLE-OWL mascot (component name kept from
// the dove era; it is an internal identifier). Sprite assets live in
// /public/kyro-owl/ (see kyroDoveManifest.js).
//
// Prop surface is a SUPERSET of the old PennyAvatar so every call site compiles
// untouched (`PennyAvatar.jsx` is now a thin wrapper over this component):
//   size        HEIGHT of the box in px (was coin diameter). Width = size × aspect.
//               Also honours the CSS var `--kyro-size` set on any ancestor.
//   state       'perched' | 'flying' | 'gliding'
//   facing      'right' | 'left' — sprites are authored facing right → scaleX(-1)
//   glance      -1 | 0 | 1 — legacy; non-zero overrides `facing`
//   blink       accepted, ignored (old call sites)
//   active      accepted, NO visual (the open chat is the affordance — the old
//               coin's static halo ring is gone; nothing circular sits behind
//               the owl anywhere, by rule)
//   speaking    wing flutter + a subtle scale pulse about the feet
//   listening   the scale pulse only
//   celebrate   green check badge
//   paused      freezes the sprite frame (offscreen / deterministic tests)
//
// GEOMETRY: the root is a `span` box sized by height — the box IS the perched
// owl (plus the sliver the downstroke reaches below its feet). The three state
// layers are absolutely positioned about one common point P (body centroid for
// fly/glide, the centroid-matched placement point for perched — see
// kyroDoveManifest.js) so switching state never moves the body. Flipping is
// scaleX(-1) about P.x, so the anchor is invariant under `facing` too. Every
// length is a fraction of the box height, expressed as calc(var(--kyro-h) × f),
// so a CSS-var size just works.
// The fly/glide layers are exactly ONE sheet cell scaled to FLY_SCALE perched
// heights (kyroDoveManifest.js), so they OVERFLOW the box a little on every side
// while airborne — only Penny.jsx and the landing scenes fly, and none of them
// clip. The wingbeat frame is selected with PERCENTAGE background-size/position
// (cols×100% by rows×100%, column c at c/(cols−1)), which is size-independent
// ONLY because the layer's aspect equals the cell's — geometry and pixels are
// keyed together in the manifest loader for exactly that reason. Inactive
// fly/glide layers are collapsed to scale(0) (not just hidden): a
// visibility:hidden box still counts toward an ancestor's scrollable overflow.
//
// MOTION: the wingbeat is driven by rAF through a ref (useSpriteFrame) — no
// per-frame React state. Idle breathe / speaking flutter / landing settle are
// CSS keyframes (`kyro-*` in index.css), all killed under prefers-reduced-motion,
// where the state is also forced to `perched`. Decorative: aria-hidden.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useMemo, useRef, useState } from 'react'
import { useReducedMotion } from 'framer-motion'
import useSpriteFrame from './hooks/useSpriteFrame.js'
import { deriveGeometry, getManifest, loadManifest } from './kyroDoveManifest.js'

/** Manifest-derived geometry; fallback first paint, swapped once fetched. */
export function useKyroGeometry() {
  const [manifest, setManifest] = useState(getManifest)
  useEffect(() => {
    let alive = true
    loadManifest().then((m) => {
      if (alive) setManifest((prev) => (prev === m ? prev : m))
    })
    return () => {
      alive = false
    }
  }, [])
  return useMemo(() => deriveGeometry(manifest), [manifest])
}

const hx = (f) => `calc(var(--kyro-h) * ${Number(f).toFixed(4)})`

export default function KyroDove({
  size = 56,
  state = 'perched',
  facing = 'right',
  glance = 0,
  celebrate = false,
  active = false,
  speaking = false,
  listening = false,
  paused = false,
  className = '',
  style,
}) {
  const reduce = useReducedMotion()
  const g = useKyroGeometry()
  const flyRef = useRef(null)

  const effState = reduce ? 'perched' : state
  const flying = effState === 'flying'
  const gliding = effState === 'gliding'
  const faceLeft = glance !== 0 ? glance < 0 : facing === 'left'

  useSpriteFrame({
    ref: flyRef,
    frames: g.fly.frames,
    cols: g.fly.cols,
    rows: g.fly.rows,
    fps: g.fly.fps,
    playing: flying && !paused && !reduce,
    resetKey: effState,
  })

  // Speaking/listening: a subtle scale pulse of the WHOLE bird about its feet
  // (root transform is otherwise unused; the flip lives one level down). Under
  // reduced motion the class is inert (index.css belt) and omitted here anyway.
  const pulseAnim =
    (speaking || listening) && !reduce && !paused
      ? 'motion-safe:animate-[kyro-pulse_1.6s_ease-in-out_infinite]'
      : ''
  const perchedFile = size > 128 ? g.perched.file : g.perched.file256

  // Idle motion on the perched layer: breathe normally, flutter while speaking.
  const perchedAnim =
    reduce || paused || !effState || effState !== 'perched'
      ? ''
      : speaking
        ? 'motion-safe:animate-[kyro-flutter_2.5s_ease-in-out_infinite]'
        : 'motion-safe:animate-[kyro-breathe_3.2s_ease-in-out_infinite]'

  const layer = (l, extra) => ({
    position: 'absolute',
    left: hx(l.left),
    top: hx(l.top),
    width: hx(l.w),
    height: hx(l.h),
    backgroundRepeat: 'no-repeat',
    pointerEvents: 'none',
    ...extra,
  })

  return (
    <span
      aria-hidden="true"
      focusable="false"
      data-kyro-state={effState}
      data-kyro-facing={faceLeft ? 'left' : 'right'}
      data-kyro-active={active ? 'true' : undefined}
      className={[className, pulseAnim].filter(Boolean).join(' ')}
      style={{
        '--kyro-h': `var(--kyro-size, ${size}px)`,
        display: 'block',
        position: 'relative',
        width: hx(g.aspect),
        height: 'var(--kyro-h)',
        transformOrigin: `${hx(g.feet.x)} ${hx(g.feet.y)}`,
        ...style,
      }}
    >
      {/* Flip wrapper — mirrors about the common anchor P.x. */}
      <span
        style={{
          position: 'absolute',
          inset: 0,
          transform: faceLeft ? 'scaleX(-1)' : 'none',
          transformOrigin: `${hx(g.ax)} 50%`,
        }}
      >
        {/* Flying: the cols×rows wingbeat sheet; frame written by useSpriteFrame.
            Inactive → collapsed (see header) but kept mounted so the sheet stays
            decoded for an instant take-off. */}
        <span
          ref={flyRef}
          data-kyro-layer="fly"
          style={layer(g.fly, {
            backgroundImage: `url(${g.fly.file})`,
            backgroundSize: `${g.fly.cols * 100}% ${g.fly.rows * 100}%`,
            backgroundPosition: '0% 0%',
            visibility: flying ? 'visible' : 'hidden',
            transform: flying ? 'none' : 'scale(0)',
          })}
        />
        {/* Gliding: one wings-spread still (the last ~200ms before landing). */}
        <span
          data-kyro-layer="glide"
          style={layer(g.glide, {
            backgroundImage: `url(${g.glide.file})`,
            backgroundSize: '100% 100%',
            visibility: gliding ? 'visible' : 'hidden',
            transform: gliding ? 'none' : 'scale(0)',
          })}
        />
        {/* Perched: the resting still; breathes about the feet. */}
        <span
          data-kyro-layer="perched"
          className={perchedAnim}
          style={layer(g.perched, {
            backgroundImage: `url(${perchedFile})`,
            backgroundSize: '100% 100%',
            transformOrigin: `${(g.perched.originX * 100).toFixed(1)}% ${(g.perched.originY * 100).toFixed(1)}%`,
            visibility: effState === 'perched' ? 'visible' : 'hidden',
          })}
        />
      </span>

      {/* Celebrate: small green check badge, bottom-right of the box. */}
      {celebrate && (
        <span
          style={{
            position: 'absolute',
            right: 0,
            bottom: hx(0.02),
            width: hx(0.3),
            height: hx(0.3),
            borderRadius: '50%',
            background: '#10B981',
            boxShadow: '0 0 0 2px #fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <svg viewBox="0 0 24 24" width="70%" height="70%" fill="none" aria-hidden="true">
            <path
              d="M5 12.5 L10 17.5 L19 7.5"
              stroke="#fff"
              strokeWidth="3.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      )}
    </span>
  )
}
