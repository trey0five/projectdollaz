// StudioHero — the ONE dark stage on /penny (ink ground + KYRO gold light,
// .stage-kyro; Premium UI §2.1 allows exactly two stages, this and the Home
// briefing band). `motion.section layout` so it morphs
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
import { Link } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { Headphones, Mic, Paperclip, Plus, Zap } from 'lucide-react'
import PennyAvatar from '../PennyAvatar.jsx'
import { BACK_PILL_DARK, BackPillBody } from '../../ui/BackLink.jsx'
import { useSpeechInput } from '../hooks/useSpeechInput.js'
import StudioBackdrop from './StudioBackdrop.jsx'
import Button from '../../ui/surface/Button.jsx'
import '../../../styles/pending/c1-flows.css'

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

function HandsFree({ chat, onListeningChange }) {
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

  // The hero owl listens (leans in, brows up) while hands-free hears you.
  useEffect(() => {
    onListeningChange?.(on && listening)
    return () => onListeningChange?.(false)
  }, [on, listening, onListeningChange])

  if (!supported) return null

  return (
    <div className="ml-auto flex flex-wrap items-center justify-end gap-2.5">
      {on && listening && transcript && (
        <span className="max-w-[24ch] break-words text-[13px] italic text-white/70">“{transcript}”</span>
      )}
      <button
        type="button"
        onClick={() => (on ? disable() : enable())}
        aria-pressed={on}
        aria-label={on ? 'Turn off hands-free voice' : 'Turn on hands-free voice'}
        className={`btn btn-sm btn-on-dark ${on ? 'border-white/50 bg-white/10 text-white' : ''}`}
      >
        {/* Recording state: a static 2px risk mark (no ping loop). */}
        {on && <i aria-hidden className="h-3 w-0.5 bg-[rgb(var(--c-risk))]" />}
        <Headphones size={14} aria-hidden />
        <span>{on ? 'Listening…' : 'Hands-free'}</span>
      </button>
    </div>
  )
}

export default function StudioHero({ compact, name, chat, askBar, onNewChat }) {
  const reduce = useReducedMotion()
  // The Scholar's story on the stage: thinks while KYRO AI works, talks while a
  // reply streams or is read aloud, listens while hands-free hears you.
  const [handsListening, setHandsListening] = useState(false)
  const streaming = chat.busy && !!chat.streamingContent
  const owl = {
    active: true,
    tone: 'dark',
    thinking: chat.busy && !streaming,
    speaking: chat.tts.speaking || streaming,
    listening: handsListening,
  }
  const layoutTransition = reduce ? { duration: 0 } : { duration: 0.5, ease: [0.22, 1, 0.36, 1] }

  return (
    <motion.section
      layout
      layoutId="studio-hero"
      transition={layoutTransition}
      className={`stage-kyro ${
        // In a conversation the slim header stays pinned so "New chat" (the way back
        // to the Studio landing) is always reachable, even after scrolling a long
        // reply. `top-16` clears the app-shell's own sticky top strip (h-14 / z-20);
        // only when compact — the tall landing hero scrolls normally.
        compact ? 'sticky top-16 z-30' : ''
      }`}
    >
      <StudioBackdrop />

      <div className="relative">
        {/* ── index 0: header (compact vs tall) ── */}
        {compact ? (
          <div className="flex items-center gap-3 px-4 pt-3.5 sm:px-6">
            <PennyAvatar size={30} {...owl} />
            <div className="min-w-0">
              <p className="font-serif text-[16px] font-semibold leading-tight text-white">KYRO Studio</p>
              <p className="truncate text-[11.5px] text-white/55">
                {chat.busy ? chat.status || 'Working…' : 'Your AI chief of staff'}
              </p>
            </div>
            <Button size="sm" onClick={onNewChat} className="btn-on-dark ml-auto" icon={<Plus size={14} />}>
              New chat
            </Button>
          </div>
        ) : (
          <div className="px-6 pt-6 sm:px-10 sm:pt-8">
            <Link to="/app" className={`mb-5 flex w-max ${BACK_PILL_DARK}`}>
              <BackPillBody label="Back to dashboard" tone="dark" />
            </Link>
            <p className="mb-3 inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-penny-light">
              <i aria-hidden className="h-3 w-0.5 bg-penny-light" />
              KYRO Studio · your AI chief of staff
            </p>
            <div className="flex items-center justify-between gap-5 sm:gap-10">
              <div className="min-w-0">
                <h1 className="max-w-[18ch] font-serif text-[30px] font-medium leading-[1.08] text-white sm:text-[44px] sm:leading-[48px]">
                  {greeting()}, {name}.
                  <br />
                  <em className="italic text-penny-light">What should we knock out today?</em>
                </h1>
                <p className="mt-3 max-w-[56ch] text-[15px] leading-[24px] text-white/75">
                  Upload anything, ask anything. KYRO reads your files, drafts your reports, updates
                  every part of the platform, and tells you what needs a decision — you just approve.
                </p>
              </div>
              {/* The large Scholar on the right (no disc/halo behind the bird,
                  by rule). It settles in ONCE; its own idle lives in the mascot
                  (the one sanctioned loop). Sized via --kyro-size. */}
              <motion.div
                className="relative shrink-0"
                initial={reduce ? false : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
              >
                <span className="relative block drop-shadow-[0_16px_36px_rgba(184,150,80,0.45)] [--kyro-size:100px] sm:[--kyro-size:190px]">
                  <PennyAvatar size={190} {...owl} />
                </span>
              </motion.div>
            </div>
          </div>
        )}

        {/* ── index 1: the ask bar on the landing (null in a conversation, where the
            composer bottom-docks). Conditional-null keeps index 2 stable. ── */}
        {askBar ? <div className="px-6 pb-2 pt-6 sm:px-10">{askBar}</div> : null}

        {/* ── index 2: controls row (STABLE; hands-free never remounts) ── */}
        <div className={`flex flex-wrap items-center gap-x-5 gap-y-2 ${compact ? 'px-4 pb-3 sm:px-6' : 'px-6 pb-10 sm:px-10'}`}>
          <div className={compact ? 'hidden' : 'flex flex-wrap items-center gap-x-5 gap-y-2 text-[12.5px] text-white/60'}>
            <span className="inline-flex items-center gap-1.5"><Mic size={13} aria-hidden className="text-penny-light" /> Speak or type</span>
            <span className="inline-flex items-center gap-1.5"><Paperclip size={13} aria-hidden className="text-penny-light" /> Drop a trial balance, budget, invoice, policy, or minutes</span>
            <span className="inline-flex items-center gap-1.5"><Zap size={13} aria-hidden className="text-penny-light" /> KYRO files it to the right place automatically</span>
          </div>
          <HandsFree chat={chat} onListeningChange={setHandsListening} />
        </div>
      </div>
    </motion.section>
  )
}
