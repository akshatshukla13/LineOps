export function GlobalLoader({ active, message }) {
  if (!active) return null

  return (
    <>
      <div aria-hidden="true" className="pointer-events-none fixed inset-x-0 top-0 z-[80]">
        <div className="loading-rail h-1 overflow-hidden bg-slate-200/95 dark:bg-slate-800/95">
          <div className="loading-rail__bar h-full w-full" />
        </div>
      </div>

      <div
        aria-busy="true"
        aria-live="polite"
        className="pointer-events-none fixed inset-0 z-[70] flex items-start justify-center bg-slate-900/20 pt-24 backdrop-blur-[1px] dark:bg-black/35"
      >
        <div className="app-loader-panel pointer-events-auto flex items-center gap-3">
          <span aria-hidden="true" className="app-loader-spinner" />
          <div>
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-50">{message || 'Please wait...'}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">Processing your request</p>
          </div>
        </div>
      </div>
    </>
  )
}

export function SectionLoader({ label = 'Loading...' }) {
  return (
    <div className="flex min-h-[140px] flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-slate-300 bg-slate-50/80 p-8 dark:border-slate-700 dark:bg-slate-900/40">
      <span aria-hidden="true" className="app-loader-spinner app-loader-spinner--md" />
      <p className="text-sm font-medium text-slate-600 dark:text-slate-300">{label}</p>
    </div>
  )
}
