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
  assignedDepartment: z.string().optional(),
  status: z.enum(['active', 'inactive']),
});

export const entrySchema = z.object({
  date: z.string().min(1),
  shiftId: z.string().min(1),
  departmentId: z.string().min(1),
  lineId: z.string().min(1),
  machineId: z.string().min(1),
  processId: z.string().min(1),
  operatorId: z.string().min(1),
  productId: z.string().min(1),
  plannedQty: z.coerce.number().min(0),
  rejectQty: z.coerce.number().min(0),
  reworkQty: z.coerce.number().min(0),
  downtimeMinutes: z.coerce.number().min(0),
  remarks: z.string().optional(),
  downtimeOtherText: z.string().optional(),
});
