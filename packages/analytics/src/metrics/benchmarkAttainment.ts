import type { MetricDef } from '../types.js'

/**
 * Benchmark Attainment = students meeting every college-readiness benchmark ÷
 * students with a benchmark determination.
 *
 * The share that matters more than the average. A school can lift its mean by a
 * point while the proportion of students actually ready for college coursework
 * stays flat — this metric is the one that moves only when more students cross
 * the line the exam's publisher drew.
 *
 * The denominator is students with a DETERMINATION, not everyone enrolled: a
 * student with no scored sections cannot be counted as meeting or missing the
 * benchmark, and folding them in either direction would be an invention.
 *
 * Extensive on both sides, so org scope is Σmet ÷ Σdetermined — a
 * student-weighted attainment rate, not an average of school rates.
 */
export const benchmarkAttainment: MetricDef = {
  key: 'benchmark_attainment',
  label: 'College-Readiness Benchmarks Met',
  unit: 'percent',
  category: 'operational',
  goodDirection: 'higher',
  domain: 'academics',
  scopeAggregation: 'recompute-from-components',
  inputs: [
    { key: 'benchmarkMetCount', source: 'operational', label: 'Students meeting all benchmarks' },
    { key: 'benchmarkTestedCount', source: 'operational', label: 'Students with a determination' },
  ],
  basis: "Share of tested students meeting every college-readiness benchmark published for the exam — the readiness measure a mean score can hide.",
  formula: 'Students meeting all benchmarks ÷ students with a benchmark determination',
  description: 'Percentage of tested students meeting all college-readiness benchmarks.',
  bands: { good: 0.5, warn: 0.3 },
  compute(_cur, _prior, curOp) {
    const met = curOp?.benchmarkMetCount ?? null
    const tested = curOp?.benchmarkTestedCount ?? null
    const inputs = [
      { key: 'benchmarkMetCount', label: 'Students meeting all benchmarks', value: met, unit: 'ratio' as const },
      { key: 'benchmarkTestedCount', label: 'Students with a determination', value: tested, unit: 'ratio' as const },
    ]
    const missing: string[] = []
    if (met === null) missing.push('benchmarkMetCount')
    if (tested === null || tested <= 0) missing.push('benchmarkTestedCount')
    if (missing.length > 0 || met === null || tested === null || tested <= 0) {
      return { value: null, available: false, inputsMissing: missing, inputs }
    }
    return { value: met / tested, available: true, inputsMissing: [], inputs }
  },
}
