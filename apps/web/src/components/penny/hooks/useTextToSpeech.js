/**
 * useTextToSpeech — speak Penny AI responses aloud.
 *
 * PRIMARY path: the browser fetches MP3 bytes from our
 * `POST /api/schools/:id/assistant/tts` proxy (keeps the ElevenLabs key on
 * the server) and plays them through a single primed Audio element.
 *
 * FALLBACK path: when the proxy is unavailable/unconfigured (503 = NORMAL dev
 * state when ELEVENLABS_API_KEY is unset, also 404 / network), we speak with
 * the browser's built-in window.speechSynthesis. The first non-OK response
 * latches a module-level `proxyAvailable = 'no'` so every subsequent chunk in
 * the session goes straight to the browser voice — and a fresh page load
 * re-probes, so adding a key later auto-upgrades to ElevenLabs.
 *
 * Tiny surface: `{ supported, enabled, setEnabled, speaking, stop, feed,
 * flush, reset, primeForGesture }`.
 *  - `enabled` is persisted in localStorage ('finrep:penny:tts:v1'); OFF by default.
 *  - `feed(cumulativeText)` queues newly-complete sentences for synthesis.
 *  - `flush(finalText)` sends any trailing fragment at stream-done.
 *  - `reset()` clears the "spoken up to" cursor between assistant messages.
 *  - `stop()` cancels everything immediately (audio.pause() AND speechSynthesis.cancel()).
 *  - `primeForGesture()` must be called from a user-gesture handler (toggle
 *    click, Send button) — iOS Safari requires it before audio plays on later
 *    async data; also primes speechSynthesis.
 *
 * Ported from the Nagare AI reference, adapted to Dollaz's fetch + proxy
 * contract and extended with the browser-speech fallback.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { tokenStore, assistantApi } from '../../../lib/api.js'

const STORAGE_KEY = 'finrep:penny:tts:v1'

// 38-byte silent WAV. Used to unlock the shared <audio> element inside a
// user gesture so subsequent ElevenLabs-fetched MP3s can play without
// further gestures. Standard iOS-Safari audio-unlock trick.
const SILENT_WAV =
  'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA'

// Module-level tri-state: which TTS transport works this session.
//   'unknown' -> try the ElevenLabs proxy first.
//   'yes'     -> proxy returned audio; keep using it.
//   'no'      -> proxy was 503/404/network; use window.speechSynthesis.
// A fresh page load resets to 'unknown', so adding a key later auto-upgrades.
let proxyAvailable = 'unknown'

function hasBrowserSpeech() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window &&
    typeof window.SpeechSynthesisUtterance !== 'undefined'
}

function isSupported() {
  if (typeof window === 'undefined') return false
  return typeof Audio !== 'undefined' || 'speechSynthesis' in window
}

export function useTextToSpeech(schoolId) {
  const supported = isSupported()
  const [enabled, setEnabledState] = useState(() => {
    try {
      return supported && localStorage.getItem(STORAGE_KEY) === '1'
    } catch {
      return false
    }
  })
  const [speaking, setSpeaking] = useState(false)

  // Cursor of how much of the cumulative streaming text we've already
  // queued for synthesis. Reset between assistant messages.
  const spokenUpToRef = useRef(0)
  // Queued sentence texts awaiting synthesis. The worker drains this
  // serially — one fetch + play at a time so audio doesn't overlap.
  const textQueueRef = useRef([])
  const workerActiveRef = useRef(false)
  // Shared, primed <audio> element. iOS unlocks audio per-instance, so
  // reusing one element lets a single gesture cover the whole session.
  const audioRef = useRef(null)
  const playResolveRef = useRef(null)
  // Latch so callbacks read the LATEST enabled flag without closing
  // over a stale one.
  const enabledRef = useRef(enabled)
  // Keep the latest schoolId for the proxy URL without re-creating callbacks.
  const schoolIdRef = useRef(schoolId)
  useEffect(() => {
    enabledRef.current = enabled
  }, [enabled])
  useEffect(() => {
    schoolIdRef.current = schoolId
  }, [schoolId])

  function ensureAudio() {
    if (audioRef.current) return audioRef.current
    if (typeof Audio === 'undefined') return null
    const a = new Audio()
    a.preload = 'auto'
    a.onended = () => {
      const r = playResolveRef.current
      playResolveRef.current = null
      if (r) r()
    }
    a.onerror = () => {
      const r = playResolveRef.current
      playResolveRef.current = null
      if (r) r()
    }
    audioRef.current = a
    return a
  }

  const stop = useCallback(() => {
    textQueueRef.current = []
    const a = audioRef.current
    if (a) {
      try {
        a.pause()
      } catch {
        /* ignore */
      }
      // Clearing src avoids the browser holding the previous blob URL
      // open after stop().
      try {
        a.removeAttribute('src')
        a.load()
      } catch {
        /* ignore */
      }
    }
    // Cancel any browser-speech utterance too.
    try {
      if (hasBrowserSpeech()) window.speechSynthesis.cancel()
    } catch {
      /* ignore */
    }
    const r = playResolveRef.current
    playResolveRef.current = null
    if (r) r()
    workerActiveRef.current = false
    spokenUpToRef.current = 0
    setSpeaking(false)
  }, [])

  const setEnabled = useCallback(
    (b) => {
      try {
        localStorage.setItem(STORAGE_KEY, b ? '1' : '0')
      } catch {
        /* ignore */
      }
      setEnabledState(b)
      if (b && supported) {
        // Unlock the shared audio element inside this gesture so the
        // SSE-driven plays that arrive later work on iOS.
        const a = ensureAudio()
        if (a) {
          try {
            a.src = SILENT_WAV
            a.volume = 1
            void a.play().catch(() => {
              /* iOS may still reject; re-primed at Send too */
            })
          } catch {
            /* ignore */
          }
        }
        // Prime speechSynthesis (the fallback transport) within the gesture.
        primeBrowserSpeech()
      }
      if (!b) {
        stop()
      }
    },
    [supported, stop],
  )

  function playUrl(url) {
    return new Promise((resolve) => {
      const a = ensureAudio()
      if (!a) {
        resolve()
        return
      }
      // Wire up the resolve for THIS play; the shared onended/onerror
      // handlers will fire it and null the ref.
      playResolveRef.current = resolve
      try {
        a.src = url
        a.volume = 1
        void a
          .play()
          .then(() => setSpeaking(true))
          .catch(() => {
            playResolveRef.current = null
            resolve()
          })
      } catch {
        playResolveRef.current = null
        resolve()
      }
    })
  }

  // FALLBACK: speak one chunk through the browser's SpeechSynthesis. Resolves
  // when the utterance ends (or errors). Queued through the SAME drainQueue
  // worker, so it never overlaps the ElevenLabs path.
  function speakBrowser(text) {
    return new Promise((resolve) => {
      if (!hasBrowserSpeech()) {
        resolve()
        return
      }
      let done = false
      const finish = () => {
        if (done) return
        done = true
        resolve()
      }
      try {
        const u = new window.SpeechSynthesisUtterance(text)
        u.lang = (typeof navigator !== 'undefined' && navigator.language) || 'en-US'
        u.onend = finish
        u.onerror = finish
        setSpeaking(true)
        window.speechSynthesis.speak(u)
      } catch {
        finish()
      }
    })
  }

  // Prime the browser-speech engine within a user gesture (some engines need
  // a first speak() to warm up). A zero-length/space utterance is enough.
  function primeBrowserSpeech() {
    if (!hasBrowserSpeech()) return
    try {
      // Warm the voice list (lazy in Chrome until first queried).
      window.speechSynthesis.getVoices()
      const u = new window.SpeechSynthesisUtterance(' ')
      u.volume = 0
      window.speechSynthesis.speak(u)
    } catch {
      /* ignore */
    }
  }

  // Fetch an MP3 blob URL from the proxy. Returns null on any non-OK and
  // latches proxyAvailable='no' (so the worker switches to browser speech).
  // On the first OK, latches 'yes'.
  async function fetchMp3(text) {
    try {
      const res = await fetch(assistantApi.ttsUrl(schoolIdRef.current), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenStore.getAccess()}`,
        },
        body: JSON.stringify({ text }),
      })
      if (!res.ok) {
        // 503 = ELEVENLABS_API_KEY unset (NORMAL dev state, not an error to
        // log); 404 / other -> also fall back. Latch once.
        proxyAvailable = 'no'
        return null
      }
      proxyAvailable = 'yes'
      const blob = await res.blob()
      return URL.createObjectURL(blob)
    } catch {
      // Network failure — fall back to browser speech for the rest of the session.
      proxyAvailable = 'no'
      return null
    }
  }

  // Held in a ref so the stable enqueueText callback can invoke the latest
  // worker without listing a per-render function in its dependency array.
  const drainQueueRef = useRef(null)
  async function drainQueue() {
    if (workerActiveRef.current) return
    workerActiveRef.current = true
    try {
      while (enabledRef.current && textQueueRef.current.length > 0) {
        const text = textQueueRef.current.shift()
        // Fall straight to browser speech once we know the proxy is down.
        if (proxyAvailable === 'no') {
          if (!enabledRef.current) break
          await speakBrowser(text)
          continue
        }
        const url = await fetchMp3(text)
        if (!url) {
          // fetchMp3 latched 'no' — speak this chunk with the browser voice
          // so the user still hears it, then continue (next chunk skips fetch).
          if (proxyAvailable === 'no' && enabledRef.current) {
            await speakBrowser(text)
          }
          continue
        }
        if (!enabledRef.current) {
          URL.revokeObjectURL(url)
          break
        }
        await playUrl(url)
        URL.revokeObjectURL(url)
      }
    } finally {
      workerActiveRef.current = false
      // Only flip "speaking" off if nothing else queued in the meantime.
      if (textQueueRef.current.length === 0) setSpeaking(false)
    }
  }

  useEffect(() => {
    drainQueueRef.current = drainQueue
  })

  const enqueueText = useCallback((text) => {
    const trimmed = text.trim()
    if (!trimmed) return
    textQueueRef.current.push(trimmed)
    if (!workerActiveRef.current) void drainQueueRef.current?.()
  }, [])

  const feed = useCallback(
    (cumulativeText) => {
      if (!enabledRef.current || !supported) return
      const pending = cumulativeText.slice(spokenUpToRef.current)
      if (!pending) return
      const matches = [...pending.matchAll(/[.!?]+(?=\s|$)/g)]
      if (matches.length === 0) return
      const last = matches[matches.length - 1]
      const endIdx = (last.index || 0) + last[0].length
      const chunk = pending.slice(0, endIdx)
      spokenUpToRef.current += endIdx
      enqueueText(chunk)
    },
    [supported, enqueueText],
  )

  const flush = useCallback(
    (finalText) => {
      if (!enabledRef.current || !supported) return
      const pending = finalText.slice(spokenUpToRef.current)
      if (!pending.trim()) return
      spokenUpToRef.current += pending.length
      enqueueText(pending)
    },
    [supported, enqueueText],
  )

  const reset = useCallback(() => {
    spokenUpToRef.current = 0
  }, [])

  const primeForGesture = useCallback(() => {
    if (!enabledRef.current || !supported) return
    const a = ensureAudio()
    if (a) {
      try {
        // Play a tick of silence on the shared element. primeForGesture is
        // only called on Send (between turns), so there's nothing to interrupt.
        a.src = SILENT_WAV
        a.volume = 1
        void a.play().catch(() => {
          /* ignore */
        })
      } catch {
        /* ignore */
      }
    }
    // Also prime the fallback engine inside the gesture.
    primeBrowserSpeech()
  }, [supported])

  // Cancel on unmount / tab hide so audio doesn't linger.
  useEffect(() => {
    if (!supported) return
    const onHide = () => {
      if (document.visibilityState === 'hidden') stop()
    }
    const onPageHide = () => stop()
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', onPageHide)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', onPageHide)
      stop()
    }
  }, [supported, stop])

  return {
    supported,
    enabled,
    setEnabled,
    speaking,
    feed,
    flush,
    reset,
    stop,
    primeForGesture,
  }
}
