import { z } from 'zod';

export const loginSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
});

export const userSchema = z.object({
  fullName: z.string().min(2, 'Full name is required'),
  employeeId: z.string().min(1, 'Employee ID is required'),
  username: z.string().min(3, 'Username is required'),
  password: z.string().min(6, 'Password must be at least 6 chars'),
  role: z.enum(['admin', 'supervisor', 'operator']),
  status: z.enum(['active', 'inactive']),
});

export const entrySchema = z.object({
  date: z.string().min(1, 'Date is required'),
  shiftId: z.string().min(1, 'Shift is required'),
  lineId: z.string().min(1, 'Line is required'),
  machineId: z.string().min(1, 'Machine is required'),
  processId: z.string().min(1, 'Process is required'),
  operatorId: z.string().min(1, 'Operator is required'),
  plannedQty: z.coerce.number().min(0, 'Target quantity must be 0 or more'),
  rejectQty: z.coerce.number().min(0),
  reworkQty: z.coerce.number().min(0),
  downtimeMinutes: z.coerce.number().min(0),
  remarks: z.string().optional(),
  downtimeOtherText: z.string().optional(),
});
