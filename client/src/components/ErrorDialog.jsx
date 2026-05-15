import { useEffect } from 'react'

export function ErrorDialog({ open, title, message, onClose }) {
  useEffect(() => {
    if (!open) return undefined
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      aria-labelledby="app-error-title"
      aria-modal="true"
      className="fixed inset-0 z-[90] flex items-center justify-center p-4"
      role="alertdialog"
    >
      <button
        aria-label="Close dialog"
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
        onClick={onClose}
        type="button"
      />
      <div className="app-dialog-panel relative w-full max-w-md">
        <div className="flex items-start gap-3">
          <span aria-hidden="true" className="app-dialog-icon app-dialog-icon--error material-symbols-outlined">
            error
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-50" id="app-error-title">
              {title}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">{message}</p>
          </div>
        </div>
        <div className="mt-5 flex justify-end">
          <button className="btn-primary min-w-[96px]" onClick={onClose} type="button">
            OK
          </button>
        </div>
      </div>
    </div>
  )
}
