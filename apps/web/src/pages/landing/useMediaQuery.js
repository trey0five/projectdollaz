// useMediaQuery — a live boolean for one media query (landing-local). Read
// synchronously on first render (useSyncExternalStore), so a phone never paints
// the desktop pose for a frame, then follows changes (rotation, resize).
import { useCallback, useSyncExternalStore } from 'react'

const canMatch = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function'

export default function useMediaQuery(query) {
  const subscribe = useCallback(
    (onChange) => {
      if (!canMatch()) return () => {}
      const mq = window.matchMedia(query)
      mq.addEventListener?.('change', onChange)
      return () => mq.removeEventListener?.('change', onChange)
    },
    [query],
  )
  return useSyncExternalStore(
    subscribe,
    () => canMatch() && window.matchMedia(query).matches,
    () => false,
  )
}
