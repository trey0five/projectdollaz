import { createElement } from 'react'
import { metricIcon } from '../../lib/metricMeta.js'

/**
 * Renders a metric's lucide icon by key. Wrapping createElement here keeps the
 * dynamic icon lookup out of caller render bodies (avoids the
 * react-hooks/static-components rule firing on a `const Icon = call()` binding).
 */
export default function MetricIcon({ metricKey, size = 20 }) {
  return createElement(metricIcon(metricKey), { size })
}
