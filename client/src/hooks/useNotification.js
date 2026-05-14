import { useState, useCallback } from 'react';

export const useNotification = () => {
  const [statusText, setStatusText] = useState('');
  const [errorText, setErrorText] = useState('');

  const showSuccess = useCallback((message) => {
    setStatusText(message);
    setErrorText('');
    setTimeout(() => setStatusText(''), 3000);
  }, []);

  const showError = useCallback((message) => {
    setErrorText(message);
    setStatusText('');
    setTimeout(() => setErrorText(''), 5000);
  }, []);

  const clearNotifications = useCallback(() => {
    setStatusText('');
    setErrorText('');
  }, []);

  return {
    statusText,
    errorText,
    showSuccess,
    showError,
    clearNotifications,
  };
};
