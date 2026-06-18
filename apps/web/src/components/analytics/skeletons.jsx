// Shimmer skeletons for the analytics dashboard. Reuse the existing
// .shimmer-bar class (already reduced-motion-gated in index.css).

export function MetricCardSkeleton() {
  return (
    <div className="card-soft p-5">
      <div className="flex items-center gap-3">
        <div className="h-11 w-11 rounded-xl shimmer-bar" />
        <div className="shimmer-bar h-3 w-28 rounded" />
      </div>
      <div className="shimmer-bar mt-5 h-9 w-32 rounded" />
      <div className="shimmer-bar mt-3 h-3 w-20 rounded" />
      <div className="shimmer-bar mt-4 h-8 w-full rounded" />
    </div>
  )
}

export function DonutSkeleton() {
  return (
    <div className="card-soft p-5">
      <div className="shimmer-bar h-3 w-32 rounded" />
      <div className="mt-6 flex items-center justify-center">
        <div className="shimmer-bar h-44 w-44 rounded-full" />
      </div>
    </div>
  )
}

export function TrendSkeleton() {
  return (
    <div className="card-soft p-5">
      <div className="shimmer-bar h-3 w-40 rounded" />
      <div className="shimmer-bar mt-6 h-56 w-full rounded" />
    </div>
  )
}

export function HeadlineSkeleton() {
  return (
    <div className="rounded-2xl bg-navy-gradient p-6 shadow-navy-glow">
      <div className="shimmer-bar h-4 w-48 rounded opacity-40" />
      <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i}>
            <div className="shimmer-bar h-3 w-24 rounded opacity-40" />
            <div className="shimmer-bar mt-3 h-8 w-28 rounded opacity-40" />
          </div>
        ))}
      </div>
    </div>
  )
}
