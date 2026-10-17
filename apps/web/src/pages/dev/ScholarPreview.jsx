// ─────────────────────────────────────────────────────────────────────────────
// /dev/scholar — DEV-ONLY review page for the Scholar mascot.
//
// Registered in App.jsx behind `import.meta.env.DEV` with a lazy import, so the
// production build never contains this page (the build check greps dist/ for
// its name). It shows:
//   1. the in-app owl and the approved mock side by side, in the same state;
//   2. every state on the four surfaces it lives on (light app, Aurora band,
//      navy cards, KYRO Studio);
//   3. every size the app uses, including the tiny (≤36px) owl;
//   4. a flight loop driven like Penny.jsx drives it (flying → gliding →
//      perched → landing), mirrored when flying left.
// Box outlines (toggle) show the owl's layout box: it should hug the resting
// bird, feet on the bottom edge.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import ScholarOwl from '../../components/penny/scholar/ScholarOwl.jsx'

const SURFACES = [
  { key: 'light', label: 'Light app', className: 'bg-cream', tone: 'light', ink: 'text-navy' },
  {
    key: 'aurora',
    label: 'Aurora band',
    style: { background: 'radial-gradient(130% 120% at 18% 0%, #1b45a5 0%, #0f2a63 42%, #07142f 100%)' },
    tone: 'dark',
    ink: 'text-white',
  },
  { key: 'navy', label: 'Navy card', className: 'bg-navy-gradient', tone: 'dark', ink: 'text-white' },
  { key: 'studio', label: 'KYRO Studio', className: 'bg-studio-hero', tone: 'dark', ink: 'text-white' },
]

// [key, label, props, replayMs] — replayMs re-fires a one-shot mood.
const STATES = [
  ['idle', 'Idle', {}, 0],
  ['hello', 'Hello', { mood: 'hello' }, 4300],
  ['talking', 'Talking', { speaking: true }, 0],
  ['listening', 'Listening', { listening: true }, 0],
  ['thinking', 'Thinking', { thinking: true }, 0],
  ['celebrate', 'Celebrate', { mood: 'celebrate' }, 3600],
  ['oops', 'Oops', { oops: true }, 0],
  ['wink', 'Wink', { mood: 'wink' }, 2600],
  ['whoa', 'Whoa', { mood: 'whoa' }, 2600],
  ['flying', 'Flying', { state: 'flying', facing: 'right' }, 0],
  ['gliding', 'Gliding', { state: 'gliding', facing: 'right' }, 0],
]
// The mock's own chip order (its window.__owl.STATES).
const MOCK_INDEX = { idle: 0, hello: 1, talking: 2, listening: 3, thinking: 4, celebrate: 5, oops: 6, flying: 7 }

const SIZES = [30, 36, 40, 44, 52, 56, 72, 96, 128, 140, 172, 190]

function useTick(ms) {
  const [n, setN] = useState(0)
  useEffect(() => {
    if (!ms) return undefined
    const id = setInterval(() => setN((v) => v + 1), ms)
    return () => clearInterval(id)
  }, [ms])
  return n
}

function Owl({ stateKey, size, tone, outline, ...rest }) {
  const row = STATES.find((s) => s[0] === stateKey) || STATES[0]
  const n = useTick(row[3])
  const props = { ...row[2], ...rest }
  return (
    <span className="relative inline-flex align-bottom" data-preview-state={stateKey} data-preview-size={size}>
      <ScholarOwl size={size} tone={tone} moodKey={props.mood ? n : undefined} {...props} />
      {outline && (
        <span aria-hidden className="pointer-events-none absolute inset-0 outline outline-1 outline-dashed outline-rose-500/80" />
      )}
    </span>
  )
}

function Surface({ s, children, className = '' }) {
  return (
    <div className={`rounded-2xl ${s.className || ''} ${className}`} style={s.style} data-surface={s.key}>
      {children}
    </div>
  )
}

// ── 1. side by side with the mock ─────────────────────────────────────────
function Compare({ stateKey, outline }) {
  const frame = useRef(null)
  const [ready, setReady] = useState(false)
  useEffect(() => {
    const w = frame.current && frame.current.contentWindow
    if (!ready || !w || !w.__owl) return
    const i = MOCK_INDEX[stateKey]
    if (i === undefined) return
    try {
      w.__owl.setAuto(false)
      w.__owl.select(i)
    } catch {
      /* the mock is a reference only */
    }
  }, [stateKey, ready])
  const onLoad = () => {
    try {
      const w = frame.current.contentWindow
      const stage = w.document.getElementById('stage')
      w.scrollTo(0, stage.getBoundingClientRect().top + w.scrollY)
    } catch {
      /* ignore */
    }
    setReady(true)
  }
  return (
    <div className="grid gap-4 lg:grid-cols-2" data-testid="scholar-compare">
      <div
        className="relative flex h-[420px] items-end justify-center overflow-hidden rounded-[28px] border border-[#E3E8F5] sm:h-[540px]"
        style={{
          background:
            'radial-gradient(ellipse 46% 40% at 50% 70%,rgba(165,220,255,.38) 0,rgba(165,220,255,0) 70%),radial-gradient(ellipse 70% 60% at 50% 40%,#F2F5FF 0,#FAFBFF 60%,#fff 100%)',
        }}
      >
        <div className="absolute inset-x-0 bottom-0 h-[46px] border-t border-[#E6EBF7] bg-gradient-to-b from-[#F3F6FD] to-[#EDF1FB]" />
        {/* The mock's 340px mover drew the bird ~277px tall, feet ~42px above the stage bottom. */}
        <div className="relative mb-[42px] flex">
          <Owl stateKey={stateKey} size={277} tone="light" outline={outline} />
        </div>
        <span className="absolute left-4 top-3 text-[12px] font-semibold uppercase tracking-[0.14em] text-[#3B4BDB]">
          In-app ScholarOwl
        </span>
      </div>
      {/* The mock laid out at its desktop width (1120px) and cropped to the
          middle of its stage, so both owls are drawn at the same scale. */}
      <div className="relative h-[420px] overflow-hidden rounded-[28px] border border-[#E3E8F5] bg-white sm:h-[540px]">
        <iframe
          ref={frame}
          title="Approved mock"
          src="/src/pages/dev/scholar-mock.html"
          onLoad={onLoad}
          className="absolute bottom-0 left-1/2 block h-[540px] w-[1120px] max-w-none -translate-x-1/2 border-0"
        />
        <span className="pointer-events-none absolute left-4 top-3 rounded bg-white/80 px-1 text-[12px] font-semibold uppercase tracking-[0.14em] text-[#3B4BDB]">
          Approved mock
        </span>
      </div>
    </div>
  )
}

// ── 4. flight loop (Penny.jsx's phase machine, in miniature) ─────────────
const PERCHES = [
  { x: 0.12, y: 0.72 },
  { x: 0.82, y: 0.3 },
  { x: 0.5, y: 0.78 },
]
function FlightStage({ size, outline }) {
  const ref = useRef(null)
  const [w, setW] = useState(600)
  const [leg, setLeg] = useState({ i: 0, from: PERCHES[0], to: PERCHES[0], phase: 'perched', dur: 1 })
  useEffect(() => {
    const el = ref.current
    if (!el) return undefined
    const ro = new ResizeObserver(() => setW(el.clientWidth))
    ro.observe(el)
    setW(el.clientWidth)
    return () => ro.disconnect()
  }, [])
  useEffect(() => {
    const timers = []
    const go = (i) => {
      const from = PERCHES[i % PERCHES.length]
      const to = PERCHES[(i + 1) % PERCHES.length]
      const dist = Math.hypot((to.x - from.x) * w, (to.y - from.y) * 300)
      const dur = Math.min(1.4, Math.max(0.6, dist / 900))
      setLeg({ i: i + 1, from, to, phase: 'flying', dur })
      timers.push(setTimeout(() => setLeg((l) => ({ ...l, phase: 'gliding' })), (dur - 0.2) * 1000))
      timers.push(setTimeout(() => setLeg((l) => ({ ...l, phase: 'perched' })), dur * 1000))
      timers.push(setTimeout(() => go(i + 1), dur * 1000 + 2600))
    }
    timers.push(setTimeout(() => go(0), 1200))
    return () => timers.forEach(clearTimeout)
  }, [w])
  const H = 300
  const W = Math.round(size * 0.727)
  const px = (p) => ({ x: p.x * (w - W), y: p.y * (H - size) })
  const a = px(leg.from)
  const b = px(leg.to)
  const lift = Math.min(80, Math.max(24, Math.hypot(b.x - a.x, b.y - a.y) * 0.12))
  const facing = b.x < a.x ? 'left' : 'right'
  const restFacing = leg.to.x > 0.5 ? 'left' : 'right'
  return (
    <div ref={ref} className="relative h-[300px] overflow-hidden rounded-2xl border border-rule bg-white" data-testid="scholar-flight">
      {PERCHES.map((p, i) => (
        <span
          key={i}
          className="absolute h-1 rounded-full bg-[#E1E6F3]"
          style={{ left: p.x * (w - W) - 8, top: p.y * (H - size) + size, width: W + 16 }}
        />
      ))}
      {/* One arc per leg: the same keyframes for flying, gliding and perched, so
          phase changes never restart it (the engine only flips the owl's state). */}
      <motion.div
        className="absolute left-0 top-0"
        initial={false}
        animate={{ x: [a.x, b.x], y: [a.y, Math.min(a.y, b.y) - lift, b.y] }}
        transition={{ x: { duration: leg.dur, ease: 'easeInOut' }, y: { duration: leg.dur, times: [0, 0.45, 1] } }}
      >
        <span className="relative block">
          <ScholarOwl size={size} state={leg.phase} facing={leg.phase === 'perched' ? restFacing : facing} />
          {outline && (
            <span aria-hidden className="pointer-events-none absolute inset-0 outline outline-1 outline-dashed outline-rose-500/80" />
          )}
        </span>
      </motion.div>
      <span className="absolute bottom-2 left-3 text-[12px] text-muted" data-testid="flight-phase">
        phase: {leg.phase}
      </span>
    </div>
  )
}

export default function ScholarPreview() {
  const [stateKey, setStateKey] = useState('idle')
  const [outline, setOutline] = useState(false)
  const [paused, setPaused] = useState(false)
  return (
    <div className="min-h-screen bg-[#F6F8FC] text-navy">
      <div className="mx-auto max-w-[1180px] px-4 py-8 sm:px-6 sm:py-10">
        <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[#3B4BDB]">Dev only · /dev/scholar</p>
        <h1 className="mt-2 font-serif text-[40px] font-semibold leading-none sm:text-[52px]">The Scholar</h1>
        <p className="mt-3 max-w-[680px] text-[15px] text-muted">
          The in-app owl, drawn and animated by the same core the demo film uses. Compare it with the approved mock,
          then check every state on every surface and every size.
        </p>

        <div className="mt-6 flex flex-wrap items-center gap-2" role="group" aria-label="Owl state">
          {STATES.map(([key, label]) => (
            <button
              key={key}
              type="button"
              data-state-chip={key}
              aria-pressed={stateKey === key}
              onClick={() => setStateKey(key)}
              className={`rounded-full border px-4 py-2 text-[13px] font-semibold transition-colors ${
                stateKey === key ? 'border-[#1E2A78] bg-[#1E2A78] text-white' : 'border-[#E3E8F5] bg-white text-navy hover:border-[#C9D2EE]'
              }`}
            >
              {label}
            </button>
          ))}
          <span className="mx-1 h-6 w-px bg-[#E3E8F5]" />
          <label className="inline-flex items-center gap-2 text-[13px] font-semibold">
            <input type="checkbox" checked={outline} onChange={(e) => setOutline(e.target.checked)} data-testid="toggle-outline" />
            Box outlines
          </label>
          <label className="inline-flex items-center gap-2 text-[13px] font-semibold">
            <input type="checkbox" checked={paused} onChange={(e) => setPaused(e.target.checked)} data-testid="toggle-paused" />
            Paused
          </label>
        </div>

        <section className="mt-6">
          <Compare stateKey={stateKey} outline={outline} />
        </section>

        <section className="mt-12">
          <h2 className="font-serif text-[30px] font-semibold">Every state, every surface</h2>
          <p className="mt-1 text-[14px] text-muted">96px. Dark surfaces use tone=&quot;dark&quot; (sky rim + glow on the bird only).</p>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4" data-testid="scholar-matrix">
            {SURFACES.map((s) => (
              <Surface key={s.key} s={s} className="p-4">
                <p className={`text-[12px] font-semibold uppercase tracking-[0.12em] ${s.ink} opacity-80`}>{s.label}</p>
                <div className="mt-3 grid grid-cols-3 gap-x-2 gap-y-5">
                  {STATES.map(([key, label]) => (
                    <div key={key} className="flex flex-col items-center gap-1.5">
                      <div className="flex h-[112px] items-end">
                        <Owl stateKey={key} size={96} tone={s.tone} outline={outline} paused={paused} thinkingDots={false} confetti={false} />
                      </div>
                      <span className={`text-[11px] font-semibold ${s.ink} opacity-75`}>{label}</span>
                    </div>
                  ))}
                </div>
              </Surface>
            ))}
          </div>
        </section>

        <section className="mt-12">
          <h2 className="font-serif text-[30px] font-semibold">Sizes</h2>
          <p className="mt-1 text-[14px] text-muted">
            30–36px use the tiny owl (thicker spectacles, no belly chevrons, still tassel). Current state: {stateKey}.
          </p>
          <div className="mt-4 space-y-4" data-testid="scholar-sizes">
            {SURFACES.map((s) => (
              <Surface key={s.key} s={s} className="overflow-x-auto p-4">
                <div className="flex min-w-max items-end gap-5">
                  {SIZES.map((px) => (
                    <div key={px} className="flex flex-col items-center gap-1">
                      <Owl stateKey={stateKey} size={px} tone={s.tone} outline={outline} paused={paused} />
                      <span className={`text-[11px] font-semibold ${s.ink} opacity-70`}>{px}</span>
                    </div>
                  ))}
                </div>
              </Surface>
            ))}
          </div>
        </section>

        <section className="mt-12">
          <h2 className="font-serif text-[30px] font-semibold">Flight</h2>
          <p className="mt-1 text-[14px] text-muted">
            Driven like the floating guide: flying, a 200ms glide, then perched (the landing plays by itself). Mirrors
            only in the air; perched it turns its eyes toward the middle.
          </p>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <FlightStage size={72} outline={outline} />
            <FlightStage size={52} outline={outline} />
          </div>
        </section>
      </div>
    </div>
  )
}
