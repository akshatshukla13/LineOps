import { API_BASE_URL, TOKEN_KEY } from '../config/constants.js';

const getToken = () => localStorage.getItem(TOKEN_KEY) || '';

const authFetch = async (path, options = {}) => {
  const token = getToken();
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || `Request failed (${response.status})`);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
};

// Auth API
export const authAPI = {
  login: (username, password) =>
    authFetch('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),
  getMe: () => authFetch('/api/auth/me'),
};

// Users API
export const usersAPI = {
  getAll: () => authFetch('/api/users'),
  create: (userData) =>
    authFetch('/api/users', {
      method: 'POST',
      body: JSON.stringify(userData),
    }),
  update: (id, userData) =>
    authFetch(`/api/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify(userData),
    }),
  resetPassword: (id, password) =>
    authFetch(`/api/users/${id}/reset-password`, {
      method: 'POST',
      body: JSON.stringify({ password }),
    }),
};

// Master API
export const masterAPI = {
  get: (kind, params = {}) => {
    const query = new URLSearchParams(params).toString();
    return authFetch(`/api/master/${kind}${query ? '?' + query : ''}`);
  },
  create: (kind, data) =>
    authFetch(`/api/master/${kind}`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  update: (kind, id, data) =>
    authFetch(`/api/master/${kind}/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  delete: (kind, id) =>
    authFetch(`/api/master/${kind}/${id}`, {
      method: 'DELETE',
    }),
  import: (rows) =>
    authFetch('/api/master/import', {
      method: 'POST',
      body: JSON.stringify({ rows }),
    }),
};

// Entries API
export const entriesAPI = {
  get: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return authFetch(`/api/entries${query ? '?' + query : ''}`);
  },
  create: (data) =>
    authFetch('/api/entries', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  update: (id, data) =>
    authFetch(`/api/entries/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  lock: (id) =>
    authFetch(`/api/entries/${id}/lock`, {
      method: 'POST',
    }),
  unlock: (id) =>
    authFetch(`/api/entries/${id}/unlock`, {
      method: 'POST',
    }),
  clonePrevious: (data) =>
    authFetch('/api/entries/clone-previous', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};

// Reports API
export const reportsAPI = {
  get: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return authFetch(`/api/reports${query ? '?' + query : ''}`);
  },
};

// Audit Logs API
export const auditLogsAPI = {
  get: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return authFetch(`/api/audit-logs${query ? '?' + query : ''}`);
  },
};

// Notifications API
export const notificationsAPI = {
  getMissedEntries: () => authFetch('/api/notifications/missed-entries'),
};
