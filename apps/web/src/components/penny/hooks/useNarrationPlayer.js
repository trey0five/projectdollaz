// ─────────────────────────────────────────────────────────────────────────────
// useNarrationPlayer — serial, segment-by-segment voice playback of a composed
// morning brief over the EXISTING useTextToSpeech transport (ElevenLabs proxy →
// browser speechSynthesis, same latch the chat uses). It owns NO transport of its
// own; it just drives `speakSegment` one chunk at a time and reports which segment
// is live so the card can karaoke-highlight and the triage boards can ring the
// matching item.
//
//   exposes { playing, activeIndex, play, pause, skipTo, supported, stop }
//
// Events dispatched (canonical, see the narration contract):
//   • 'penny:voice-claim' { owner: 'brief' }  — on play(), so chat TTS stops.
//   • 'penny:narrate-active' { itemId|null }  — as each ITEM segment goes live
//     (null when leaving items / stopping). The boards listen and gold-ring the
//     matching card.
//
// A monotonically-increasing run id invalidates any in-flight loop the instant we
// pause / skip / stop / the data changes, so old awaited segments can't advance
// a stale playhead. Stops on unmount and whenever the segments identity changes.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTextToSpeech } from './useTextToSpeech.js'

function emitActive(segments, idx) {
  const seg = idx >= 0 ? segments?.[idx] : null
  const itemId = seg && seg.kind === 'item' ? seg.itemId ?? null : null
  try {
    window.dispatchEvent(new CustomEvent('penny:narrate-active', { detail: { itemId } }))
  } catch {
    /* ignore */
  }
}

export function useNarrationPlayer(segments, schoolId) {
  // useTextToSpeech returns a fresh object literal each render, but its callbacks
  // (stop, speakSegment) and `supported` are stable (useCallback / derived value).
  // Destructure those stable pieces so our effects DON'T re-run every render — a
  // `tts`-object dep would make the data-change effect stop playback on each render.
  const { stop: ttsStop, speakSegment, supported } = useTextToSpeech(schoolId, 'brief')
  const [playing, setPlaying] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)

  // Latest segments without re-creating the play loop each render.
  const segmentsRef = useRef(segments)
  useEffect(() => {
    segmentsRef.current = segments
  }, [segments])

  // Run token: bumping it invalidates any loop currently awaiting a segment.
  const runIdRef = useRef(0)
  // Where a pause left off, so Play resumes on the same segment.
  const resumeAtRef = useRef(0)
  const activeIndexRef = useRef(-1)

  const halt = useCallback(() => {
    runIdRef.current += 1
    ttsStop()
  }, [ttsStop])

  const runFrom = useCallback(
    (startIdx) => {
      const segs = segmentsRef.current || []
      if (!segs.length || !supported) return
      // Claim the voice inside the (user-gesture) call so chat TTS stops at once
      // and iOS audio is primed on the same tick.
      try {
        window.dispatchEvent(new CustomEvent('penny:voice-claim', { detail: { owner: 'brief' } }))
      } catch {
        /* ignore */
      }
      const myRun = ++runIdRef.current
      const begin = Math.min(Math.max(0, startIdx | 0), segs.length - 1)
      setPlaying(true)
      ;(async () => {
        for (let i = begin; i < segs.length; i += 1) {
          if (runIdRef.current !== myRun) return
          activeIndexRef.current = i
          resumeAtRef.current = i
          setActiveIndex(i)
          emitActive(segs, i)
          // Serial by design — one voice, one segment at a time.
          await speakSegment(segs[i].text)
          if (runIdRef.current !== myRun) return
        }
        // Reached the end cleanly.
        if (runIdRef.current === myRun) {
          activeIndexRef.current = -1
          resumeAtRef.current = 0
          setPlaying(false)
          setActiveIndex(-1)
          emitActive(segs, -1)
        }
      })()
    },
    [speakSegment, supported],
  )

  const play = useCallback(() => runFrom(resumeAtRef.current || 0), [runFrom])

  const pause = useCallback(() => {
    // Remember the live segment so Play resumes there; halt the voice.
    resumeAtRef.current = activeIndexRef.current >= 0 ? activeIndexRef.current : 0
    halt()
    setPlaying(false)
    emitActive(segmentsRef.current, -1)
  }, [halt])

  const skipTo = useCallback((idx) => runFrom(idx), [runFrom])

  const stop = useCallback(() => {
    resumeAtRef.current = 0
    activeIndexRef.current = -1
    halt()
    setPlaying(false)
    setActiveIndex(-1)
    emitActive(segmentsRef.current, -1)
  }, [halt])

  // Stop cleanly on unmount.
  useEffect(() => {
    return () => {
      runIdRef.current += 1
      ttsStop()
    }
  }, [ttsStop])

  // Data changed → invalidate any running loop and reset the playhead. State is
  // reset via the microtask-deferred + cancelled-guard idiom (house pattern) so we
  // never call a setter synchronously in the effect body. Depends only on the
  // segments identity (ttsStop is stable), so it fires on real data changes only.
  useEffect(() => {
    let cancelled = false
    runIdRef.current += 1
    const myRun = runIdRef.current
    resumeAtRef.current = 0
    activeIndexRef.current = -1
    ttsStop()
    Promise.resolve().then(() => {
      // A play() that started AFTER this effect ran (e.g. a "Brief me" click racing
      // the first narration load) bumps runIdRef past myRun — don't clobber its
      // freshly-set playing:true back to false.
      if (cancelled || runIdRef.current !== myRun) return
      setPlaying((p) => (p ? false : p))
      setActiveIndex((i) => (i === -1 ? i : -1))
    })
    return () => {
      cancelled = true
    }
  }, [segments, ttsStop])

  return { playing, activeIndex, play, pause, skipTo, stop, supported }
}
