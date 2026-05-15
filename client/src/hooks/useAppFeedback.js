import { useCallback, useRef, useState } from 'react'

export function useAppFeedback() {
  const [toasts, setToasts] = useState([])
  const [errorDialog, setErrorDialog] = useState(null)
  const toastTimers = useRef(new Map())

  const removeToast = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
    const timer = toastTimers.current.get(id)
    if (timer) {
      clearTimeout(timer)
      toastTimers.current.delete(id)
    }
  }, [])

  const showToast = useCallback(
    (type, message, title) => {
      if (!message) return
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`
      setToasts((current) => [...current, { id, type, message, title }])
      const duration = type === 'success' ? 4500 : 5500
      const timer = setTimeout(() => removeToast(id), duration)
      toastTimers.current.set(id, timer)
    },
    [removeToast],
  )

  const showSuccess = useCallback(
    (message, title = 'Success') => {
      showToast('success', message, title)
    },
    [showToast],
  )

  const showError = useCallback((message, title = 'Something went wrong') => {
    if (!message) return
    setErrorDialog({ message, title })
  }, [])

  const dismissError = useCallback(() => {
    setErrorDialog(null)
  }, [])

  return {
    toasts,
    errorDialog,
    showSuccess,
    showError,
    dismissError,
    removeToast,
  }
}
