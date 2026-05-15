import { useState, useCallback } from 'react';

export const useAuth = () => {
  const [token, setToken] = useState(() => localStorage.getItem('lineops_token') || '');
  const [user, setUser] = useState(() => {
    try {
      const raw = localStorage.getItem('lineops_user');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });

  const login = useCallback((newToken, newUser) => {
    setToken(newToken);
    setUser(newUser);
    localStorage.setItem('lineops_token', newToken);
    localStorage.setItem('lineops_user', JSON.stringify(newUser));
  }, []);

  const logout = useCallback(() => {
    setToken('');
    setUser(null);
    localStorage.removeItem('lineops_token');
    localStorage.removeItem('lineops_user');
  }, []);

  return { token, user, login, logout, isAuthenticated: !!token };
};

export const useTheme = () => {
  const [theme, setTheme] = useState(() => localStorage.getItem('lineops_theme') || 'light');

  const toggleTheme = useCallback(() => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    localStorage.setItem('lineops_theme', newTheme);
    document.documentElement.classList.toggle('dark', newTheme === 'dark');
  }, [theme]);

  return { theme, toggleTheme };
};
