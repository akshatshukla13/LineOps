import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';

const app = express();

const PORT = Number(process.env.PORT || 5000);
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_DB_NAME = process.env.MONGODB_DB_NAME || 'lineops';
const JWT_SECRET = process.env.JWT_SECRET || 'lineops-dev-secret';
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Admin@123';

app.use(cors({ origin: FRONTEND_URL }));
app.use(express.json({ limit: '2mb' }));

const roleHierarchy = {
  admin: 3,
  supervisor: 2,
  operator: 1,
};

const userSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true, trim: true },
    employeeId: { type: String, required: true, trim: true },
    username: { type: String, required: true, unique: true, trim: true, lowercase: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['admin', 'supervisor', 'operator'], required: true, default: 'operator' },
    assignedDepartment: { type: mongoose.Schema.Types.ObjectId, ref: 'MasterItem', default: null },
    assignedLines: [{ type: mongoose.Schema.Types.ObjectId, ref: 'MasterItem' }],
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  },
  { timestamps: true }
);

const masterItemSchema = new mongoose.Schema(
  {
    kind: {
      type: String,
      enum: [
        'shift',
        'department',
        'line',
        'machine',
        'process',
        'operator',
        'product',
        'defectType',
        'downtimeReason',
      ],
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

const editLogSchema = new mongoose.Schema(
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

const productionEntrySchema = new mongoose.Schema(
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
    status: { type: String, enum: ['draft', 'submitted', 'locked'], default: 'draft' },
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

const auditLogSchema = new mongoose.Schema(
  {
    action: { type: String, required: true },
    entity: { type: String, required: true },
    entityId: { type: String, required: true },
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

const User = mongoose.model('User', userSchema);
const MasterItem = mongoose.model('MasterItem', masterItemSchema);
const ProductionEntry = mongoose.model('ProductionEntry', productionEntrySchema);
const AuditLog = mongoose.model('AuditLog', auditLogSchema);

const ensureDbConnection = async () => {
  if (!MONGODB_URI) {
    throw new Error('MONGODB_URI is required');
  }

  await mongoose.connect(MONGODB_URI, {
    dbName: MONGODB_DB_NAME,
  });
};

const sanitizeUser = (user) => ({
  id: user._id,
  fullName: user.fullName,
  employeeId: user.employeeId,
  username: user.username,
  role: user.role,
  assignedDepartment: user.assignedDepartment,
  assignedLines: user.assignedLines,
  status: user.status,
});

const nowDateString = () => new Date().toISOString().slice(0, 10);

const previousDateString = () => {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  return date.toISOString().slice(0, 10);
};

const calculateMetrics = (entry) => {
  const totalProduction = (entry.hourlyInputs || []).reduce((sum, n) => sum + Number(n || 0), 0);
  const netProduction = Math.max(totalProduction - Number(entry.rejectQty || 0) - Number(entry.reworkQty || 0), 0);
  const target = Number(entry.plannedQty || 0);
  const efficiencyPct = target > 0 ? (netProduction / target) * 100 : 0;
  const lossPct = target > 0 ? ((target - netProduction) / target) * 100 : 0;
  const downtimePct = 720 > 0 ? (Number(entry.downtimeMinutes || 0) / 720) * 100 : 0;
  return {
    totalProduction,
    netProduction,
    efficiencyPct: Number(efficiencyPct.toFixed(2)),
    lossPct: Number(lossPct.toFixed(2)),
    downtimePct: Number(downtimePct.toFixed(2)),
  };
};

const recordAudit = async (actorId, action, entity, entityId, metadata = {}) => {
  await AuditLog.create({ actorId, action, entity, entityId: String(entityId), metadata });
};

const authMiddleware = async (req, res, next) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(payload.sub);

    if (!user || user.status !== 'active') {
      return res.status(401).json({ error: 'Invalid user' });
    }

    req.user = user;
    return next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

const requireRole = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  return next();
};

const canEditEntry = (user, entry) => {
  if (user.role === 'admin') return true;
  if (entry.status === 'locked') return false;

  const today = nowDateString();
  const yesterday = previousDateString();

  if (user.role === 'operator') {
    return String(entry.createdBy) === String(user._id) && entry.date === today;
  }

  if (user.role === 'supervisor') {
    const inDateWindow = entry.date === today || entry.date === yesterday;
    const departmentMatch =
      !user.assignedDepartment || String(user.assignedDepartment) === String(entry.departmentId);
    const lineMatch =
      !user.assignedLines?.length ||
      user.assignedLines.some((lineId) => String(lineId) === String(entry.lineId));
    return inDateWindow && departmentMatch && lineMatch;
  }

  return false;
};

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }

  const user = await User.findOne({ username: String(username).toLowerCase().trim() });
  if (!user || user.status !== 'active') {
    return res.status(401).json({ error: 'Invalid credentials.' });
  }

  const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
  if (!isPasswordValid) {
    return res.status(401).json({ error: 'Invalid credentials.' });
  }

  const token = jwt.sign({ sub: String(user._id), role: user.role }, JWT_SECRET, { expiresIn: '12h' });
  return res.json({ token, user: sanitizeUser(user) });
});

app.get('/api/auth/me', authMiddleware, async (req, res) => {
  return res.json({ user: sanitizeUser(req.user) });
});

app.get('/api/users', authMiddleware, requireRole('admin'), async (req, res) => {
  const users = await User.find().sort({ createdAt: -1 }).lean();
  return res.json(users.map((u) => ({ ...sanitizeUser(u), id: u._id })));
});

app.post('/api/users', authMiddleware, requireRole('admin'), async (req, res) => {
  const {
    fullName,
    employeeId,
    username,
    password,
    role = 'operator',
    assignedDepartment = null,
    assignedLines = [],
    status = 'active',
  } = req.body || {};

  if (!fullName || !employeeId || !username || !password) {
    return res.status(400).json({ error: 'fullName, employeeId, username and password are required.' });
  }

  if (!roleHierarchy[role]) {
    return res.status(400).json({ error: 'Invalid role.' });
  }

  const existing = await User.findOne({ username: String(username).toLowerCase().trim() });
  if (existing) {
    return res.status(409).json({ error: 'Username already exists.' });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await User.create({
    fullName,
    employeeId,
    username,
    passwordHash,
    role,
    assignedDepartment,
    assignedLines,
    status,
  });

  await recordAudit(req.user._id, 'create', 'user', user._id, { role: user.role });
  return res.status(201).json({ user: sanitizeUser(user) });
});

app.put('/api/users/:id', authMiddleware, requireRole('admin'), async (req, res) => {
  const { id } = req.params;
  const { fullName, employeeId, role, assignedDepartment, assignedLines, status } = req.body || {};

  const user = await User.findById(id);
  if (!user) {
    return res.status(404).json({ error: 'User not found.' });
  }

  if (fullName !== undefined) user.fullName = fullName;
  if (employeeId !== undefined) user.employeeId = employeeId;
  if (role !== undefined && roleHierarchy[role]) user.role = role;
  if (assignedDepartment !== undefined) user.assignedDepartment = assignedDepartment;
  if (assignedLines !== undefined) user.assignedLines = assignedLines;
  if (status !== undefined && ['active', 'inactive'].includes(status)) user.status = status;

  await user.save();
  await recordAudit(req.user._id, 'update', 'user', user._id, { role: user.role, status: user.status });
  return res.json({ user: sanitizeUser(user) });
});

app.post('/api/users/:id/reset-password', authMiddleware, requireRole('admin'), async (req, res) => {
  const { id } = req.params;
  const { password } = req.body || {};
  if (!password || String(password).length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }

  const user = await User.findById(id);
  if (!user) {
    return res.status(404).json({ error: 'User not found.' });
  }

  user.passwordHash = await bcrypt.hash(password, 10);
  await user.save();
  await recordAudit(req.user._id, 'reset_password', 'user', user._id);
  return res.json({ ok: true });
});

app.get('/api/master/:kind', authMiddleware, async (req, res) => {
  const { kind } = req.params;
  const { active, lineId, machineId, departmentId } = req.query;

  const query = { kind };
  if (active !== undefined) query.active = active === 'true';
  if (lineId) query.lineId = lineId;
  if (machineId) query.machineId = machineId;
  if (departmentId) query.departmentId = departmentId;

  const rows = await MasterItem.find(query).sort({ name: 1 }).lean();
  return res.json(rows);
});

app.post('/api/master/:kind', authMiddleware, requireRole('admin'), async (req, res) => {
  const { kind } = req.params;
  const { name, code = '', active = true, departmentId = null, lineId = null, machineId = null } = req.body || {};

  if (!name) {
    return res.status(400).json({ error: 'Name is required.' });
  }

  try {
    const row = await MasterItem.create({ kind, name, code, active, departmentId, lineId, machineId });
    await recordAudit(req.user._id, 'create', `master:${kind}`, row._id, { name: row.name });
    return res.status(201).json(row);
  } catch (error) {
    return res.status(400).json({ error: 'Could not create master item.' });
  }
});

app.put('/api/master/:kind/:id', authMiddleware, requireRole('admin'), async (req, res) => {
  const { kind, id } = req.params;
  const row = await MasterItem.findOne({ _id: id, kind });
  if (!row) {
    return res.status(404).json({ error: 'Master item not found.' });
  }

  const updates = ['name', 'code', 'active', 'departmentId', 'lineId', 'machineId'];
  updates.forEach((key) => {
    if (req.body[key] !== undefined) {
      row[key] = req.body[key];
    }
  });

  await row.save();
  await recordAudit(req.user._id, 'update', `master:${kind}`, row._id, { name: row.name, active: row.active });
  return res.json(row);
});

app.delete('/api/master/:kind/:id', authMiddleware, requireRole('admin'), async (req, res) => {
  const { kind, id } = req.params;
  const row = await MasterItem.findOneAndDelete({ _id: id, kind });
  if (!row) {
    return res.status(404).json({ error: 'Master item not found.' });
  }

  await recordAudit(req.user._id, 'delete', `master:${kind}`, row._id, { name: row.name });
  return res.json({ ok: true });
});

app.post('/api/master/import', authMiddleware, requireRole('admin'), async (req, res) => {
  const { rows = [] } = req.body || {};
  if (!Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ error: 'rows array is required.' });
  }

  const prepared = rows
    .filter((r) => r?.kind && r?.name)
    .map((r) => ({
      kind: r.kind,
      name: r.name,
      code: r.code || '',
      active: r.active !== false,
      departmentId: r.departmentId || null,
      lineId: r.lineId || null,
      machineId: r.machineId || null,
    }));

  if (!prepared.length) {
    return res.status(400).json({ error: 'No valid rows found.' });
  }

  await MasterItem.insertMany(prepared, { ordered: false });
  await recordAudit(req.user._id, 'import', 'master', 'bulk', { count: prepared.length });
  return res.status(201).json({ imported: prepared.length });
});

app.get('/api/entries', authMiddleware, async (req, res) => {
  const { date, shiftId, operatorId, machineId, departmentId, from, to, lineId } = req.query;
  const query = {};
  if (date) query.date = date;
  if (shiftId) query.shiftId = shiftId;
  if (operatorId) query.operatorId = operatorId;
  if (machineId) query.machineId = machineId;
  if (departmentId) query.departmentId = departmentId;
  if (lineId) query.lineId = lineId;
  if (from || to) {
    query.date = {};
    if (from) query.date.$gte = from;
    if (to) query.date.$lte = to;
  }

  if (req.user.role === 'operator') {
    query.createdBy = req.user._id;
  }

  if (req.user.role === 'supervisor') {
    if (req.user.assignedDepartment) {
      query.departmentId = req.user.assignedDepartment;
    }
    if (req.user.assignedLines?.length) {
      query.lineId = { $in: req.user.assignedLines };
    }
  }

  const entries = await ProductionEntry.find(query)
    .sort({ date: -1, createdAt: -1 })
    .populate('createdBy', 'fullName username')
    .lean();

  return res.json(entries);
});

app.post('/api/entries', authMiddleware, requireRole('admin', 'supervisor', 'operator'), async (req, res) => {
  const payload = req.body || {};
  const requiredIds = [
    'shiftId',
    'departmentId',
    'lineId',
    'machineId',
    'processId',
    'operatorId',
    'productId',
  ];

  for (const key of requiredIds) {
    if (!payload[key]) {
      return res.status(400).json({ error: `${key} is required.` });
    }
  }

  if (!payload.date || !payload.plannedQty || !Array.isArray(payload.hourlyInputs)) {
    return res.status(400).json({ error: 'date, plannedQty and hourlyInputs are required.' });
  }

  const entry = new ProductionEntry({
    date: payload.date,
    shiftId: payload.shiftId,
    departmentId: payload.departmentId,
    lineId: payload.lineId,
    machineId: payload.machineId,
    processId: payload.processId,
    operatorId: payload.operatorId,
    productId: payload.productId,
    plannedQty: Number(payload.plannedQty),
    hourlyInputs: payload.hourlyInputs.map((n) => Number(n || 0)).slice(0, 12).concat(Array(12).fill(0)).slice(0, 12),
    rejectQty: Number(payload.rejectQty || 0),
    reworkQty: Number(payload.reworkQty || 0),
    downtimeMinutes: Number(payload.downtimeMinutes || 0),
    downtimeReasonId: payload.downtimeReasonId || null,
    downtimeOtherText: payload.downtimeOtherText || '',
    remarks: payload.remarks || '',
    status: payload.status || 'draft',
    createdBy: req.user._id,
    updatedBy: req.user._id,
    editedCells: [],
  });

  Object.assign(entry, calculateMetrics(entry));
  await entry.save();
  await recordAudit(req.user._id, 'create', 'entry', entry._id, { date: entry.date, status: entry.status });
  return res.status(201).json(entry);
});

app.put('/api/entries/:id', authMiddleware, requireRole('admin', 'supervisor', 'operator'), async (req, res) => {
  const entry = await ProductionEntry.findById(req.params.id);
  if (!entry) {
    return res.status(404).json({ error: 'Entry not found.' });
  }

  if (!canEditEntry(req.user, entry)) {
    return res.status(403).json({ error: 'You cannot edit this entry.' });
  }

  const editableFields = [
    'plannedQty',
    'hourlyInputs',
    'rejectQty',
    'reworkQty',
    'downtimeMinutes',
    'downtimeReasonId',
    'downtimeOtherText',
    'remarks',
    'shiftId',
    'departmentId',
    'lineId',
    'machineId',
    'processId',
    'operatorId',
    'productId',
    'status',
  ];

  const editReason = req.body.editReason || '';
  const changedFields = [];

  editableFields.forEach((field) => {
    if (req.body[field] !== undefined) {
      const oldValue = entry[field];
      const newValue = field === 'hourlyInputs'
        ? req.body[field].map((n) => Number(n || 0)).slice(0, 12).concat(Array(12).fill(0)).slice(0, 12)
        : req.body[field];

      const changed = JSON.stringify(oldValue) !== JSON.stringify(newValue);
      if (changed) {
        entry[field] = newValue;
        changedFields.push(field);
        entry.editLogs.push({
          field,
          oldValue,
          newValue,
          editedBy: req.user._id,
          editedAt: new Date(),
          reason: editReason,
        });
      }
    }
  });

  if (!changedFields.length) {
    return res.json(entry);
  }

  entry.updatedBy = req.user._id;
  entry.editedCells = Array.from(new Set([...(entry.editedCells || []), ...changedFields]));
  Object.assign(entry, calculateMetrics(entry));
  await entry.save();

  await recordAudit(req.user._id, 'update', 'entry', entry._id, { changedFields, editReason });
  return res.json(entry);
});

app.post('/api/entries/:id/lock', authMiddleware, requireRole('admin', 'supervisor'), async (req, res) => {
  const entry = await ProductionEntry.findById(req.params.id);
  if (!entry) {
    return res.status(404).json({ error: 'Entry not found.' });
  }

  entry.status = 'locked';
  entry.approvedBy = req.user._id;
  entry.updatedBy = req.user._id;
  await entry.save();

  await recordAudit(req.user._id, 'lock', 'entry', entry._id);
  return res.json(entry);
});

app.post('/api/entries/:id/unlock', authMiddleware, requireRole('admin'), async (req, res) => {
  const entry = await ProductionEntry.findById(req.params.id);
  if (!entry) {
    return res.status(404).json({ error: 'Entry not found.' });
  }

  entry.status = 'submitted';
  entry.updatedBy = req.user._id;
  await entry.save();

  await recordAudit(req.user._id, 'unlock', 'entry', entry._id);
  return res.json(entry);
});

app.post('/api/entries/clone-previous', authMiddleware, requireRole('admin', 'supervisor', 'operator'), async (req, res) => {
  const { date, lineId, machineId, shiftId } = req.body || {};
  if (!date) {
    return res.status(400).json({ error: 'date is required.' });
  }

  const current = new Date(date);
  current.setDate(current.getDate() - 1);
  const previousDate = current.toISOString().slice(0, 10);

  const query = { date: previousDate };
  if (lineId) query.lineId = lineId;
  if (machineId) query.machineId = machineId;
  if (shiftId) query.shiftId = shiftId;

  if (req.user.role === 'operator') {
    query.createdBy = req.user._id;
  }

  const source = await ProductionEntry.findOne(query).sort({ createdAt: -1 });
  if (!source) {
    return res.status(404).json({ error: 'No previous-day setup found.' });
  }

  const clone = new ProductionEntry({
    date,
    shiftId: source.shiftId,
    departmentId: source.departmentId,
    lineId: source.lineId,
    machineId: source.machineId,
    processId: source.processId,
    operatorId: source.operatorId,
    productId: source.productId,
    plannedQty: source.plannedQty,
    hourlyInputs: Array(12).fill(0),
    rejectQty: 0,
    reworkQty: 0,
    downtimeMinutes: 0,
    downtimeReasonId: source.downtimeReasonId,
    downtimeOtherText: source.downtimeOtherText,
    remarks: source.remarks,
    status: 'draft',
    createdBy: req.user._id,
    updatedBy: req.user._id,
    editedCells: [],
    editLogs: [],
  });

  Object.assign(clone, calculateMetrics(clone));
  await clone.save();

  await recordAudit(req.user._id, 'clone_previous', 'entry', clone._id, { sourceId: source._id });
  return res.status(201).json(clone);
});

app.get('/api/reports', authMiddleware, async (req, res) => {
  const {
    type = 'daily',
    date,
    from,
    to,
    shiftId,
    operatorId,
    machineId,
    departmentId,
    lineId,
  } = req.query;

  const query = {};
  if (date) query.date = date;
  if (shiftId) query.shiftId = shiftId;
  if (operatorId) query.operatorId = operatorId;
  if (machineId) query.machineId = machineId;
  if (departmentId) query.departmentId = departmentId;
  if (lineId) query.lineId = lineId;
  if (from || to) {
    query.date = {};
    if (from) query.date.$gte = from;
    if (to) query.date.$lte = to;
  }

  if (req.user.role === 'operator') {
    query.createdBy = req.user._id;
  }

  if (req.user.role === 'supervisor') {
    if (req.user.assignedDepartment) query.departmentId = req.user.assignedDepartment;
    if (req.user.assignedLines?.length) query.lineId = { $in: req.user.assignedLines };
  }

  const entries = await ProductionEntry.find(query).lean();

  const groupKeyByType = {
    daily: 'date',
    line: 'lineId',
    operator: 'operatorId',
    machine: 'machineId',
    shift: 'shiftId',
    dateRange: 'date',
  };

  const keyField = groupKeyByType[type] || 'date';
  const bucket = new Map();

  for (const entry of entries) {
    const key = String(entry[keyField] || 'unknown');
    if (!bucket.has(key)) {
      bucket.set(key, {
        key,
        records: 0,
        plannedQty: 0,
        totalProduction: 0,
        netProduction: 0,
        rejectQty: 0,
        reworkQty: 0,
        downtimeMinutes: 0,
        efficiencyPct: 0,
      });
    }

    const item = bucket.get(key);
    item.records += 1;
    item.plannedQty += Number(entry.plannedQty || 0);
    item.totalProduction += Number(entry.totalProduction || 0);
    item.netProduction += Number(entry.netProduction || 0);
    item.rejectQty += Number(entry.rejectQty || 0);
    item.reworkQty += Number(entry.reworkQty || 0);
    item.downtimeMinutes += Number(entry.downtimeMinutes || 0);
  }

  const report = Array.from(bucket.values()).map((row) => ({
    ...row,
    efficiencyPct: row.plannedQty > 0 ? Number(((row.netProduction / row.plannedQty) * 100).toFixed(2)) : 0,
  }));

  return res.json({ type, totalRows: report.length, report, sourceCount: entries.length });
});

app.get('/api/audit-logs', authMiddleware, requireRole('admin', 'supervisor'), async (req, res) => {
  const { entity = '', entityId = '' } = req.query;
  const query = {};
  if (entity) query.entity = entity;
  if (entityId) query.entityId = entityId;

  const logs = await AuditLog.find(query).sort({ createdAt: -1 }).limit(500).lean();
  return res.json(logs);
});

app.get('/api/notifications/missed-entries', authMiddleware, requireRole('admin', 'supervisor'), async (req, res) => {
  const today = nowDateString();

  const [operators, entries] = await Promise.all([
    User.find({ role: 'operator', status: 'active' }).lean(),
    ProductionEntry.find({ date: today }).lean(),
  ]);

  const enteredByOperator = new Set(entries.map((entry) => String(entry.createdBy)));
  const missed = operators.filter((operator) => !enteredByOperator.has(String(operator._id)));

  return res.json({
    date: today,
    missedCount: missed.length,
    missed: missed.map((u) => ({ id: u._id, fullName: u.fullName, employeeId: u.employeeId })),
  });
});

app.use((error, req, res, next) => {
  console.error(error);
  res.status(500).json({ error: 'Internal server error.' });
});

const seedInitialData = async () => {
  const existingAdmin = await User.findOne({ username: ADMIN_USERNAME.toLowerCase() });

  if (!existingAdmin) {
    const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);
    await User.create({
      fullName: 'System Admin',
      employeeId: 'ADM001',
      username: ADMIN_USERNAME.toLowerCase(),
      passwordHash,
      role: 'admin',
      status: 'active',
    });
  }

  const defaults = [
    { kind: 'shift', name: 'Morning' },
    { kind: 'shift', name: 'Evening' },
    { kind: 'shift', name: 'Night' },
    { kind: 'downtimeReason', name: 'Power Failure' },
    { kind: 'downtimeReason', name: 'Machine Breakdown' },
    { kind: 'downtimeReason', name: 'Maintenance' },
    { kind: 'downtimeReason', name: 'Material Delay' },
    { kind: 'downtimeReason', name: 'Operator Break' },
    { kind: 'downtimeReason', name: 'Quality Issue' },
    { kind: 'downtimeReason', name: 'Other' },
  ];

  for (const item of defaults) {
    const exists = await MasterItem.findOne({ kind: item.kind, name: item.name });
    if (!exists) {
      await MasterItem.create(item);
    }
  }
};

const start = async () => {
  await ensureDbConnection();
  await seedInitialData();

  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
};

start().catch((error) => {
  console.error('Failed to start server', error);
  process.exit(1);
});
