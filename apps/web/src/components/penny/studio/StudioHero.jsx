// StudioHero — the navy command hero. `motion.section layout` so it morphs
// smoothly between the tall landing hero and the slim conversation bar.
//
// The hands-free control lives here in BOTH states and is rendered at a STABLE
// child index (index 2) so it never remounts when `compact` flips — the listening
// loop survives the landing↔conversation swap. On the landing the ask bar renders
// inside the hero (index 1); in a conversation the composer bottom-docks (rendered
// by PennyStudio) so `askBar` is null here — a conditional-null keeps index 2
// stable, so hands-free stays mounted.
//
// Hands-free voice is the ONE surface allowed to auto-send: it primes TTS inside
// the toggle click, listens continuously, and sends each finished utterance. It
// re-arms the mic only once Penny has FINISHED speaking (so it can't transcribe
// its own TTS reply → feedback loop). The ask-bar dictation mic never auto-sends.
import { useEffect, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Headphones, Plus } from 'lucide-react'
import PennyAvatar from '../PennyAvatar.jsx'
import { useSpeechInput } from '../hooks/useSpeechInput.js'
import StudioBackdrop from './StudioBackdrop.jsx'

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

function HandsFree({ chat }) {
  const { supported, listening, transcript, start, stop } = useSpeechInput()
  const [on, setOn] = useState(false)
  const onRef = useRef(false)
  const prevListen = useRef(false)
  const prevBusy = useRef(false)
  const prevSpeaking = useRef(false)
  const sendingRef = useRef(false)
  const timerRef = useRef(null)

  const setHandsFree = (v) => {
    onRef.current = v
    setOn(v)
  }
  const clearTimer = () => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }

  const enable = () => {
    chat.tts.primeForGesture() // MUST run inside this click gesture (iOS audio unlock)
    chat.tts.setEnabled(true)
    setHandsFree(true)
    start()
  }
  const disable = () => {
    setHandsFree(false)
    sendingRef.current = false
    clearTimer()
    stop()
    try {
      chat.tts.stop()
    } catch {
      /* ignore */
    }
  }

  // End-of-utterance (listening true→false) → debounce, then auto-send.
  useEffect(() => {
    const was = prevListen.current
    prevListen.current = listening
    if (!was || listening || !onRef.current) return
    const text = (transcript || '').trim()
    clearTimer()
    if (text) {
      timerRef.current = window.setTimeout(() => {
        if (!onRef.current) return
        sendingRef.current = true
        chat.send(text)
      }, 700)
    } else {
      // Silence — resume listening shortly, but only while fully idle.
      timerRef.current = window.setTimeout(() => {
        if (onRef.current && !chat.busy && !chat.tts.speaking && !listening) start()
      }, 400)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listening, transcript])

  // After a hands-free send finishes, re-arm the mic — but ONLY once we're fully
  // idle: the reply has finished streaming (busy false) AND Penny has stopped
  // speaking (tts.speaking false). Waiting for the speaking→idle edge prevents the
  // mic from transcribing Penny's own TTS voice and auto-sending it (feedback loop).
  useEffect(() => {
    const wasBusy = prevBusy.current
    const wasSpeaking = prevSpeaking.current
    prevBusy.current = chat.busy
    prevSpeaking.current = chat.tts.speaking
    if (!onRef.current || !sendingRef.current) return
    const idle = !chat.busy && !chat.tts.speaking
    const edge = (wasBusy && !chat.busy) || (wasSpeaking && !chat.tts.speaking)
    if (idle && edge && !listening) {
      sendingRef.current = false
      clearTimer()
      timerRef.current = window.setTimeout(() => {
        if (onRef.current && !chat.busy && !chat.tts.speaking && !listening) start()
      }, 500)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chat.busy, chat.tts.speaking])

  useEffect(
    () => () => {
      clearTimer()
      stop()
    },
    [stop],
  )

  if (!supported) return null

  return (
    <div className="ml-auto flex flex-wrap items-center justify-end gap-2.5">
      {on && listening && transcript && (
        <span className="max-w-[24ch] break-words text-[13px] italic text-gold-light">“{transcript}”</span>
      )}
      <button
        type="button"
        onClick={() => (on ? disable() : enable())}
        aria-pressed={on}
        aria-label={on ? 'Turn off hands-free voice' : 'Turn on hands-free voice'}
        className={`relative inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/60 ${
          on
            ? 'border-danger bg-danger text-white'
            : 'border-gold/40 bg-gold/10 text-gold-light hover:border-gold/70 hover:text-white'
        }`}
      >
        {on && (
          <span aria-hidden className="absolute inset-0 rounded-full bg-danger/40 motion-safe:animate-ping motion-reduce:hidden" />
        )}
        <Headphones size={14} className="relative" aria-hidden />
        <span className="relative">{on ? 'Listening…' : 'Hands-free'}</span>
      </button>
    </div>
  )
}

export default function StudioHero({ compact, name, chat, askBar, onNewChat }) {
  const reduce = useReducedMotion()
  const layoutTransition = reduce ? { duration: 0 } : { duration: 0.5, ease: [0.22, 1, 0.36, 1] }

  return (
    <motion.section
      layout
      layoutId="studio-hero"
      transition={layoutTransition}
      className="relative overflow-hidden rounded-2xl border border-gold/20 bg-[linear-gradient(150deg,#1f3d72_0%,#12294f_46%,#0b1b36_100%)] shadow-navy-glow"
    >
      <StudioBackdrop />

      <div className="relative">
        {/* ── index 0: header (compact vs tall) ── */}
        {compact ? (
          <div className="flex items-center gap-3 px-4 pt-3.5 sm:px-6">
            <PennyAvatar size={30} active speaking={chat.tts.speaking} />
            <div className="min-w-0">
              <p className="font-serif text-[16px] font-semibold leading-tight text-white">Penny Studio</p>
              <p className="truncate text-[11.5px] text-white/55">
                {chat.busy ? chat.status || 'Working…' : 'Your AI chief of staff'}
              </p>
            </div>
            <button
              type="button"
              onClick={onNewChat}
              className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-gold/40 bg-white/[0.06] px-3.5 py-1.5 text-[12.5px] font-semibold text-gold-light transition hover:border-gold/70 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/60"
            >
              <Plus size={14} aria-hidden /> New chat
            </button>
          </div>
        ) : (
          <div className="px-6 pt-10 sm:px-10 sm:pt-12">
            <p className="mb-3.5 inline-flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.2em] text-gold-light">
              <span aria-hidden className="relative flex h-[7px] w-[7px]">
                <span className="absolute inline-flex h-full w-full rounded-full bg-gold-light opacity-70 motion-safe:animate-ping motion-reduce:hidden" />
                <span className="relative inline-flex h-[7px] w-[7px] rounded-full bg-gold-light" />
              </span>
              Penny Studio · your AI chief of staff
            </p>
            <h1 className="max-w-[16ch] font-serif text-[30px] font-semibold leading-[1.05] text-white sm:text-[44px]">
              {greeting()}, {name}.
              <br />
              <em className="italic text-gold-light">What should we knock out today?</em>
            </h1>
            <p className="mt-3 max-w-[52ch] text-[15px] leading-relaxed text-white/75 sm:text-[17px]">
              Upload anything, ask anything. Penny reads your files, drafts your reports, updates every
              part of the platform, and tells you what needs a decision — you just approve.
            </p>
          </div>
        )}

        {/* ── index 1: the ask bar on the landing (null in a conversation, where the
            composer bottom-docks). Conditional-null keeps index 2 stable. ── */}
        {askBar ? <div className="px-6 pb-2 pt-6 sm:px-10">{askBar}</div> : null}

        {/* ── index 2: controls row (STABLE; hands-free never remounts) ── */}
        <div className={`flex flex-wrap items-center gap-x-5 gap-y-2 ${compact ? 'px-4 pb-3 sm:px-6' : 'px-6 pb-10 sm:px-10'}`}>
          <div className={compact ? 'hidden' : 'flex flex-wrap items-center gap-x-5 gap-y-2 text-[12.5px] text-white/55'}>
            <span className="inline-flex items-center gap-1.5">🎤 Speak or type</span>
            <span className="inline-flex items-center gap-1.5">📎 Drop a trial balance, budget, invoice, policy, or minutes</span>
            <span className="inline-flex items-center gap-1.5">⚡ Penny files it to the right place automatically</span>
          </div>
          <HandsFree chat={chat} />
        </div>
      </div>
    </motion.section>
  )
}
