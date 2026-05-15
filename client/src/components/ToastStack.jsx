const toastStyles = {
  success: {
    icon: 'check_circle',
    className: 'app-toast app-toast--success',
  },
  info: {
    icon: 'info',
    className: 'app-toast app-toast--info',
  },
}

export function ToastStack({ toasts, onDismiss }) {
  if (!toasts.length) return null

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed bottom-4 right-4 z-[85] flex w-full max-w-sm flex-col gap-2 p-2 sm:bottom-6 sm:right-6"
    >
      {toasts.map((toast) => {
        const style = toastStyles[toast.type] || toastStyles.info
        return (
          <div className={`${style.className} pointer-events-auto`} key={toast.id} role="status">
            <span aria-hidden="true" className="material-symbols-outlined text-[20px]">
              {style.icon}
            </span>
            <div className="min-w-0 flex-1">
              {toast.title ? <p className="text-xs font-bold uppercase tracking-wide">{toast.title}</p> : null}
              <p className="text-sm">{toast.message}</p>
            </div>
            <button
              aria-label="Dismiss notification"
              className="app-toast-close"
              onClick={() => onDismiss(toast.id)}
              type="button"
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          </div>
        )
      })}
    </div>
  )
}
