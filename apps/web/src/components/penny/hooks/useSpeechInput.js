/**
 * useSpeechInput — voice-to-text via the browser Web Speech API.
 *
 * Exposes a tiny surface: { supported, listening, start, stop, transcript }.
 *  - `supported` is true only when SpeechRecognition (or the webkit-prefixed
 *    variant) exists, so callers can hide the mic entirely on Firefox etc.
 *  - `transcript` carries the latest interim + final text; it resets to ''
 *    each time a new listening session starts.
 *  - Recognition uses continuous=false, interimResults=true and the
 *    browser's default language. It stops on stop(), on a natural `end`,
 *    or on any error (permission denied, no-speech, …) — gracefully, with
 *    no crash and no thrown error surfaced to the user.
 *
 * Ported verbatim from the Nagare AI reference (TS -> JS).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

function getRecognitionCtor() {
  if (typeof window === 'undefined') return null
  return window.SpeechRecognition || window.webkitSpeechRecognition || null
}

/**
 * Fully tear down a recognition instance and release the microphone.
 * Detach the handlers first so a late `onend`/`onresult`/`onerror` can't
 * fire after teardown, then call BOTH abort() and stop() — some mobile
 * browsers (notably iOS webkit) don't reliably release the mic on just
 * one. Safe to call on an already-stopped instance.
 */
function teardown(rec) {
  if (!rec) return
  rec.onresult = null
  rec.onerror = null
  rec.onend = null
  try { rec.abort() } catch { /* ignore */ }
  try { rec.stop() } catch { /* ignore */ }
}

export function useSpeechInput() {
  const Ctor = useMemo(() => getRecognitionCtor(), [])
  const supported = !!Ctor

  const [listening, setListening] = useState(false)
  const [transcript, setTranscript] = useState('')
  const recRef = useRef(null)

  const stop = useCallback(() => {
    teardown(recRef.current)
    recRef.current = null
    setListening(false)
  }, [])

  const start = useCallback(() => {
    if (!Ctor) return
    // Tear down any prior instance before opening a fresh session.
    teardown(recRef.current)
    recRef.current = null

    let rec
    try {
      rec = new Ctor()
    } catch {
      return
    }
    rec.continuous = false
    rec.interimResults = true
    rec.maxAlternatives = 1
    // Default to the document/browser language; empty string lets the
    // engine pick. navigator.language is a safe explicit fallback.
    rec.lang = (typeof navigator !== 'undefined' && navigator.language) || ''

    rec.onresult = (ev) => {
      // Concatenate every result (final + interim) into one live string.
      let text = ''
      for (let i = 0; i < ev.results.length; i++) {
        text += ev.results[i][0]?.transcript ?? ''
      }
      setTranscript(text)
    }
    rec.onerror = () => {
      // Permission denied / no-speech / aborted — fail silently.
      setListening(false)
    }
    rec.onend = () => {
      setListening(false)
    }

    recRef.current = rec
    setTranscript('')
    try {
      rec.start()
      setListening(true)
    } catch {
      // start() throws if called while already running — treat as no-op.
      setListening(false)
    }
  }, [Ctor])

  // Release the mic on unmount — closing the assistant panel unmounts the
  // input bar (and this hook with it), so a live session must not survive.
  useEffect(() => {
    return () => {
      teardown(recRef.current)
      recRef.current = null
    }
  }, [])

  // Also release the mic when the tab/app is hidden or the page is being
  // unloaded — on mobile, switching away from the app should not leave a
  // hot mic. visibilitychange covers app-switch/lock; pagehide covers
  // navigation away and bfcache.
  useEffect(() => {
    if (typeof document === 'undefined') return
    const release = () => {
      if (document.visibilityState === 'hidden') {
        teardown(recRef.current)
        recRef.current = null
        setListening(false)
      }
    }
    const onPageHide = () => {
      teardown(recRef.current)
      recRef.current = null
      setListening(false)
    }
    document.addEventListener('visibilitychange', release)
    window.addEventListener('pagehide', onPageHide)
    return () => {
      document.removeEventListener('visibilitychange', release)
      window.removeEventListener('pagehide', onPageHide)
    }
  }, [])

  return { supported, listening, transcript, start, stop }
}
