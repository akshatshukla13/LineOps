export const TOKEN_KEY = 'lineops_token';
export const USER_KEY = 'lineops_user';
export const THEME_KEY = 'lineops_theme';
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

if (import.meta.env.PROD && !import.meta.env.VITE_API_BASE_URL) {
  throw new Error('VITE_API_BASE_URL is required in production builds');
}

export const MASTER_KINDS = [
  'shift',
  'line',
  'machine',
  'process',
  'operator',
  'defectType',
];

export const REPORT_TYPES = [
  { value: 'monitoring', label: 'Production Monitoring (Detailed)' },
  { value: 'daily', label: 'Daily Report (Summary)' },
  { value: 'line', label: 'Line-wise Report' },
  { value: 'operator', label: 'Operator-wise Report' },
  { value: 'machine', label: 'Machine-wise Report' },
  { value: 'shift', label: 'Shift-wise Report' },
  { value: 'dateRange', label: 'Date Range Report' },
];
