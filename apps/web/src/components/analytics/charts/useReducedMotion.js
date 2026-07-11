// useReducedMotion — stable import path for the charts library. Re-exports
// framer-motion's reactive hook (updates if the OS setting changes mid-session)
// so charts can decouple from the framer import site. When true, every chart
// renders its FINAL state with zero animation (dataviz non-negotiable).
export { useReducedMotion } from 'framer-motion'
