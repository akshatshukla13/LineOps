// Role hierarchy for authorization
export const ROLE_HIERARCHY = {
  admin: 3,
  supervisor: 2,
  operator: 1,
};

// Master data kinds
export const MASTER_KINDS = [
  'shift',
  'department',
  'line',
  'machine',
  'process',
  'operator',
  'product',
  'defectType',
  'downtimeReason',
];

export const MASTER_KIND_SET = new Set(MASTER_KINDS);

// Date validation regex
export const DATE_STRING_REGEX = /^\d{4}-\d{2}-\d{2}$/;

// Role-based enum values
export const VALID_ROLES = ['admin', 'supervisor', 'operator'];
export const VALID_STATUSES = ['active', 'inactive'];
export const VALID_ENTRY_STATUSES = ['draft', 'submitted', 'locked'];
