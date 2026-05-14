import mongoose from 'mongoose';
import { MASTER_KINDS, VALID_ROLES, VALID_STATUSES, VALID_ENTRY_STATUSES } from '../config/constants.js';

export const userSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true, trim: true },
    employeeId: { type: String, required: true, trim: true },
    username: { type: String, required: true, unique: true, trim: true, lowercase: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: VALID_ROLES, required: true, default: 'operator' },
    assignedDepartment: { type: mongoose.Schema.Types.ObjectId, ref: 'MasterItem', default: null },
    assignedLines: [{ type: mongoose.Schema.Types.ObjectId, ref: 'MasterItem' }],
    status: { type: String, enum: VALID_STATUSES, default: 'active' },
  },
  { timestamps: true }
);

export const masterItemSchema = new mongoose.Schema(
  {
    kind: {
      type: String,
      enum: MASTER_KINDS,
      required: true,
    },
    name: { type: String, required: true, trim: true },
    code: { type: String, trim: true },
    active: { type: Boolean, default: true },
    departmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'MasterItem', default: null },
    lineId: { type: mongoose.Schema.Types.ObjectId, ref: 'MasterItem', default: null },
    machineId: { type: mongoose.Schema.Types.ObjectId, ref: 'MasterItem', default: null },
  },
  { timestamps: true }
);

masterItemSchema.index({ kind: 1, name: 1 }, { unique: true });

export const editLogSchema = new mongoose.Schema(
  {
    field: { type: String, required: true },
    oldValue: { type: mongoose.Schema.Types.Mixed },
    newValue: { type: mongoose.Schema.Types.Mixed },
    editedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    editedAt: { type: Date, default: Date.now },
    reason: { type: String, default: '' },
  },
  { _id: false }
);

export const productionEntrySchema = new mongoose.Schema(
  {
    date: { type: String, required: true },
    shiftId: { type: mongoose.Schema.Types.ObjectId, ref: 'MasterItem', required: true },
    departmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'MasterItem', required: true },
    lineId: { type: mongoose.Schema.Types.ObjectId, ref: 'MasterItem', required: true },
    machineId: { type: mongoose.Schema.Types.ObjectId, ref: 'MasterItem', required: true },
    processId: { type: mongoose.Schema.Types.ObjectId, ref: 'MasterItem', required: true },
    operatorId: { type: mongoose.Schema.Types.ObjectId, ref: 'MasterItem', required: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'MasterItem', required: true },
    plannedQty: { type: Number, required: true, min: 0 },
    hourlyInputs: {
      type: [Number],
      validate: {
        validator: (v) => Array.isArray(v) && v.length === 12,
        message: 'hourlyInputs must contain 12 values',
      },
      required: true,
    },
    rejectQty: { type: Number, default: 0, min: 0 },
    reworkQty: { type: Number, default: 0, min: 0 },
    downtimeMinutes: { type: Number, default: 0, min: 0 },
    downtimeReasonId: { type: mongoose.Schema.Types.ObjectId, ref: 'MasterItem', default: null },
    downtimeOtherText: { type: String, default: '' },
    remarks: { type: String, default: '' },
    status: { type: String, enum: VALID_ENTRY_STATUSES, default: 'draft' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    editedCells: [{ type: String }],
    editLogs: [editLogSchema],
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    totalProduction: { type: Number, default: 0 },
    netProduction: { type: Number, default: 0 },
    efficiencyPct: { type: Number, default: 0 },
    lossPct: { type: Number, default: 0 },
    downtimePct: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export const auditLogSchema = new mongoose.Schema(
  {
    action: { type: String, required: true },
    entity: { type: String, required: true },
    entityId: { type: String, required: true },
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

export const User = mongoose.model('User', userSchema);
export const MasterItem = mongoose.model('MasterItem', masterItemSchema);
export const ProductionEntry = mongoose.model('ProductionEntry', productionEntrySchema);
export const AuditLog = mongoose.model('AuditLog', auditLogSchema);
