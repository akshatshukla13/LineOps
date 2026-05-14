import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import rateLimit from 'express-rate-limit';

const app = express();

const PORT = Number(process.env.PORT || 5000);
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_DB_NAME = process.env.MONGODB_DB_NAME || 'lineops';
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const JWT_SECRET = process.env.JWT_SECRET || (IS_PRODUCTION ? '' : 'lineops-dev-secret');
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || (IS_PRODUCTION ? 'Admin@123' : 'Admin@123');

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, curl requests)
    if (!origin) return callback(null, true);
    
    // Allow localhost on any port and specific domain
    if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
      return callback(null, true);
    }
    
    // If we want to restrict to specific domains in production
    const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [];
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    
    // Otherwise, block the request
    if (IS_PRODUCTION) {
      callback(new Error('Not allowed by CORS'));
    } else {
      // In development, allow all
      callback(null, true);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json({ limit: '2mb' }));

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1200,
  standardHeaders: true,
  legacyHeaders: false,
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 25,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api', apiLimiter);

const roleHierarchy = {
  admin: 3,
  supervisor: 2,
  operator: 1,
};

const MASTER_KINDS = [
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

const MASTER_KIND_SET = new Set(MASTER_KINDS);
const DATE_STRING_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const isValidObjectId = (value) => mongoose.isValidObjectId(value);
const asObjectIdOrNull = (value) => (value && isValidObjectId(value) ? value : null);
const isValidDateString = (value) => DATE_STRING_REGEX.test(String(value || ''));
const isValidMasterKind = (value) => MASTER_KIND_SET.has(value);

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
    sheetLineNo: { type: String, default: '' },
    scheduledHours: { type: mongoose.Schema.Types.Mixed, default: 8 },
    sheetShift: { type: String, default: '' },
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
    importSource: { type: String, default: '' },
    importRow: { type: Number, default: null },
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

if (IS_PRODUCTION && !JWT_SECRET) {
  throw new Error('JWT_SECRET is required in production.');
}

if (IS_PRODUCTION && !ADMIN_PASSWORD) {
  throw new Error('ADMIN_PASSWORD is required in production.');
}

const ensureDbConnection = async () => {
  if (!MONGODB_URI) {
    throw new Error('MONGODB_URI is required');
  }

  await mongoose.connect(MONGODB_URI, {
    dbName: MONGODB_DB_NAME,
    sanitizeFilter: true,
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

const normalizeHourlyInputs = (values = []) => {
  return [...values.map((n) => Number(n || 0)), ...Array(12).fill(0)].slice(0, 12);
};

const formatDisplayDate = (value) => {
  if (!value) return '';
  const [year, month, day] = String(value).slice(0, 10).split('-');
  return year && month && day ? `${day}.${month}.${year}` : value;
};

const getMasterLabel = (value, fallback = '-') => value?.name || value?.code || fallback;

const getShiftCode = (value) => {
  const label = getMasterLabel(value, '');
  const compact = label.replace(/^shift\s+/i, '').trim();
  return compact ? compact.charAt(0).toUpperCase() : '-';
};

const toMonitoringExportRow = (entry, index) => {
  const hourlyInputs = [...(entry.hourlyInputs || []), ...Array(12).fill('')].slice(0, 12);
  const total = entry.totalProduction ?? hourlyInputs.reduce((sum, value) => sum + Number(value || 0), 0);

  return {
    sno: index + 1,
    lineNo: entry.sheetLineNo || entry.lineId?.code || entry.lineId?.name?.replace(/\D+/g, '') || getMasterLabel(entry.lineId, ''),
    machine: getMasterLabel(entry.machineId),
    operatorName: getMasterLabel(entry.operatorId),
    processName: getMasterLabel(entry.processId),
    shift: entry.sheetShift ?? getShiftCode(entry.shiftId),
    hours: entry.scheduledHours ?? 8,
    targetQty: entry.plannedQty ?? 0,
    actualQtyDate: formatDisplayDate(entry.date),
    actualQty: hourlyInputs,
    total,
    rejected: entry.rejectQty || '',
    rework: entry.reworkQty || '',
    downtimeMinutes: entry.downtimeMinutes || '',
    reason: entry.downtimeReasonId?.name || entry.downtimeOtherText || '',
    efficiency: `${Math.round(Number(entry.efficiencyPct || 0))}%`,
    remarks: entry.remarks || '',
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

app.post('/api/auth/login', loginLimiter, async (req, res) => {
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

  if (!isValidObjectId(id)) {
    return res.status(400).json({ error: 'Invalid user id.' });
  }

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

  if (!isValidObjectId(id)) {
    return res.status(400).json({ error: 'Invalid user id.' });
  }
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

  if (!isValidMasterKind(kind)) {
    return res.status(400).json({ error: 'Invalid master kind.' });
  }

  const safeKind = MASTER_KINDS.find((item) => item === kind);
  const query = { kind: safeKind };
  if (active !== undefined) query.active = active === 'true';

  if (lineId) {
    const sanitizedLineId = asObjectIdOrNull(lineId);
    if (!sanitizedLineId) return res.status(400).json({ error: 'Invalid lineId.' });
    query.lineId = sanitizedLineId;
  }

  if (machineId) {
    const sanitizedMachineId = asObjectIdOrNull(machineId);
    if (!sanitizedMachineId) return res.status(400).json({ error: 'Invalid machineId.' });
    query.machineId = sanitizedMachineId;
  }

  if (departmentId) {
    const sanitizedDepartmentId = asObjectIdOrNull(departmentId);
    if (!sanitizedDepartmentId) return res.status(400).json({ error: 'Invalid departmentId.' });
    query.departmentId = sanitizedDepartmentId;
  }

  const rows = await MasterItem.find(query).sort({ name: 1 }).lean();
  return res.json(rows);
});

app.post('/api/master/:kind', authMiddleware, requireRole('admin'), async (req, res) => {
  const { kind } = req.params;

  if (!isValidMasterKind(kind)) {
    return res.status(400).json({ error: 'Invalid master kind.' });
  }
  const { name, code = '', active = true, departmentId = null, lineId = null, machineId = null } = req.body || {};

  if (!name) {
    return res.status(400).json({ error: 'Name is required.' });
  }

  try {
    const sanitizedDepartmentId = departmentId ? asObjectIdOrNull(departmentId) : null;
    const sanitizedLineId = lineId ? asObjectIdOrNull(lineId) : null;
    const sanitizedMachineId = machineId ? asObjectIdOrNull(machineId) : null;

    if ((departmentId && !sanitizedDepartmentId) || (lineId && !sanitizedLineId) || (machineId && !sanitizedMachineId)) {
      return res.status(400).json({ error: 'Invalid parent id in master item.' });
    }

    const row = await MasterItem.create({
      kind: MASTER_KINDS.find((item) => item === kind),
      name,
      code,
      active,
      departmentId: sanitizedDepartmentId,
      lineId: sanitizedLineId,
      machineId: sanitizedMachineId,
    });
    await recordAudit(req.user._id, 'create', `master:${kind}`, row._id, { name: row.name });
    return res.status(201).json(row);
  } catch (error) {
    return res.status(400).json({ error: 'Could not create master item.' });
  }
});

app.put('/api/master/:kind/:id', authMiddleware, requireRole('admin'), async (req, res) => {
  const { kind, id } = req.params;

  if (!isValidMasterKind(kind) || !isValidObjectId(id)) {
    return res.status(400).json({ error: 'Invalid kind or id.' });
  }

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

  if (!isValidMasterKind(kind) || !isValidObjectId(id)) {
    return res.status(400).json({ error: 'Invalid kind or id.' });
  }

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
    .filter((r) => r?.kind && isValidMasterKind(r.kind) && r?.name)
    .map((r) => ({
      kind: isValidMasterKind(r.kind) ? r.kind : null,
      name: r.name,
      code: r.code || '',
      active: r.active !== false,
      departmentId: r.departmentId ? asObjectIdOrNull(r.departmentId) : null,
      lineId: r.lineId ? asObjectIdOrNull(r.lineId) : null,
      machineId: r.machineId ? asObjectIdOrNull(r.machineId) : null,
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

  if (date) {
    if (!isValidDateString(date)) return res.status(400).json({ error: 'Invalid date.' });
    query.date = new Date(`${date}T00:00:00.000Z`).toISOString().slice(0, 10);
  }

  const idFilters = { shiftId, operatorId, machineId, departmentId, lineId };
  for (const [field, rawValue] of Object.entries(idFilters)) {
    if (!rawValue) continue;
    const sanitizedId = asObjectIdOrNull(rawValue);
    if (!sanitizedId) return res.status(400).json({ error: `Invalid ${field}.` });
    query[field] = sanitizedId;
  }

  if (from || to) {
    query.date = {};
    if (from) {
      if (!isValidDateString(from)) return res.status(400).json({ error: 'Invalid from date.' });
      query.date.$gte = new Date(`${from}T00:00:00.000Z`).toISOString().slice(0, 10);
    }
    if (to) {
      if (!isValidDateString(to)) return res.status(400).json({ error: 'Invalid to date.' });
      query.date.$lte = new Date(`${to}T00:00:00.000Z`).toISOString().slice(0, 10);
    }
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

  if (!payload.date || payload.plannedQty === undefined || !Array.isArray(payload.hourlyInputs)) {
    return res.status(400).json({ error: 'date, plannedQty and hourlyInputs are required.' });
  }

  if (!isValidDateString(payload.date)) {
    return res.status(400).json({ error: 'Invalid date.' });
  }

  for (const key of requiredIds) {
    if (!asObjectIdOrNull(payload[key])) {
      return res.status(400).json({ error: `Invalid ${key}.` });
    }
  }

  if (payload.downtimeReasonId && !asObjectIdOrNull(payload.downtimeReasonId)) {
    return res.status(400).json({ error: 'Invalid downtimeReasonId.' });
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
    sheetLineNo: payload.sheetLineNo || '',
    scheduledHours: payload.scheduledHours ?? 8,
    sheetShift: payload.sheetShift || '',
    hourlyInputs: normalizeHourlyInputs(payload.hourlyInputs),
    rejectQty: Number(payload.rejectQty || 0),
    reworkQty: Number(payload.reworkQty || 0),
    downtimeMinutes: Number(payload.downtimeMinutes || 0),
    downtimeReasonId: payload.downtimeReasonId || null,
    downtimeOtherText: payload.downtimeOtherText || '',
    remarks: payload.remarks || '',
    importSource: payload.importSource || '',
    importRow: payload.importRow ?? null,
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
  if (!isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: 'Invalid entry id.' });
  }

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
    'sheetLineNo',
    'scheduledHours',
    'sheetShift',
    'status',
  ];

  const editReason = req.body.editReason || '';
  const changedFields = [];

  editableFields.forEach((field) => {
    if (req.body[field] !== undefined) {
      const oldValue = entry[field];
      const newValue = field === 'hourlyInputs'
        ? normalizeHourlyInputs(req.body[field])
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
  if (!isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: 'Invalid entry id.' });
  }

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
  if (!isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: 'Invalid entry id.' });
  }

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

  if (!isValidDateString(date)) {
    return res.status(400).json({ error: 'Invalid date.' });
  }

  const sanitizedLineId = lineId ? asObjectIdOrNull(lineId) : null;
  const sanitizedMachineId = machineId ? asObjectIdOrNull(machineId) : null;
  const sanitizedShiftId = shiftId ? asObjectIdOrNull(shiftId) : null;

  if (lineId && !sanitizedLineId) return res.status(400).json({ error: 'Invalid lineId.' });
  if (machineId && !sanitizedMachineId) return res.status(400).json({ error: 'Invalid machineId.' });
  if (shiftId && !sanitizedShiftId) return res.status(400).json({ error: 'Invalid shiftId.' });

  const current = new Date(date);
  current.setDate(current.getDate() - 1);
  const previousDate = current.toISOString().slice(0, 10);

  const query = { date: previousDate };
  if (sanitizedLineId) query.lineId = sanitizedLineId;
  if (sanitizedMachineId) query.machineId = sanitizedMachineId;
  if (sanitizedShiftId) query.shiftId = sanitizedShiftId;

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
    sheetLineNo: source.sheetLineNo || '',
    scheduledHours: source.scheduledHours ?? 8,
    sheetShift: source.sheetShift || '',
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

  const allowedReportTypes = new Set(['monitoring', 'daily', 'line', 'operator', 'machine', 'shift', 'dateRange']);
  if (!allowedReportTypes.has(type)) {
    return res.status(400).json({ error: 'Invalid report type.' });
  }

  const query = {};
  if (date) {
    if (!isValidDateString(date)) return res.status(400).json({ error: 'Invalid date.' });
    query.date = new Date(`${date}T00:00:00.000Z`).toISOString().slice(0, 10);
  }

  const reportIdFilters = { shiftId, operatorId, machineId, departmentId, lineId };
  for (const [field, rawValue] of Object.entries(reportIdFilters)) {
    if (!rawValue) continue;
    const sanitizedId = asObjectIdOrNull(rawValue);
    if (!sanitizedId) return res.status(400).json({ error: `Invalid ${field}.` });
    query[field] = sanitizedId;
  }

  if (from || to) {
    query.date = {};
    if (from) {
      if (!isValidDateString(from)) return res.status(400).json({ error: 'Invalid from date.' });
      query.date.$gte = new Date(`${from}T00:00:00.000Z`).toISOString().slice(0, 10);
    }
    if (to) {
      if (!isValidDateString(to)) return res.status(400).json({ error: 'Invalid to date.' });
      query.date.$lte = new Date(`${to}T00:00:00.000Z`).toISOString().slice(0, 10);
    }
  }

  if (req.user.role === 'operator') {
    query.createdBy = req.user._id;
  }

  if (req.user.role === 'supervisor') {
    if (req.user.assignedDepartment) query.departmentId = req.user.assignedDepartment;
    if (req.user.assignedLines?.length) query.lineId = { $in: req.user.assignedLines };
  }

  // For monitoring report type, return detailed entries with populated references
  if (type === 'monitoring') {
    const entries = await ProductionEntry.find(query)
      .populate('shiftId', 'name code')
      .populate('departmentId', 'name code')
      .populate('lineId', 'name code')
      .populate('machineId', 'name code')
      .populate('processId', 'name code')
      .populate('operatorId', 'name code')
      .populate('productId', 'name code')
      .populate('downtimeReasonId', 'name code')
      .sort({ date: -1, shiftId: 1 })
      .lean();

    return res.json({
      type,
      totalRows: entries.length,
      report: entries,
      spreadsheetRows: entries.map(toMonitoringExportRow),
      sourceCount: entries.length,
    });
  }

  // For other report types, return aggregated data
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
  if (entity) query.entity = String(entity).replace(/[^a-zA-Z0-9:_-]/g, '');
  if (entityId) query.entityId = String(entityId).replace(/[^a-zA-Z0-9]/g, '');

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

  const existingOperator = await User.findOne({ username: 'operator' });

  if (!existingOperator) {
    const passwordHash = await bcrypt.hash('Operator@123', 10);
    await User.create({
      fullName: 'Default Operator',
      employeeId: 'OP001',
      username: 'operator',
      passwordHash,
      role: 'operator',
      status: 'active',
    });
  }

  const defaults = [
    // Shifts
    { kind: 'shift', name: 'Morning', code: 'SH-M' },
    { kind: 'shift', name: 'Evening', code: 'SH-E' },
    { kind: 'shift', name: 'Night', code: 'SH-N' },
    // Departments - organized by type
    { kind: 'department', name: 'Assembly', code: 'DEPT-ASM' },
    { kind: 'department', name: 'Quality Control', code: 'DEPT-QC' },
    { kind: 'department', name: 'Packaging', code: 'DEPT-PKG' },
    { kind: 'department', name: 'Production', code: 'DEPT-PROD' },
    { kind: 'department', name: 'Maintenance', code: 'DEPT-MAINT' },
    // Downtime Reasons - comprehensive list
    { kind: 'downtimeReason', name: 'Power Failure', code: 'DT-PWR' },
    { kind: 'downtimeReason', name: 'Machine Breakdown', code: 'DT-BRK' },
    { kind: 'downtimeReason', name: 'Planned Maintenance', code: 'DT-PMAINT' },
    { kind: 'downtimeReason', name: 'Emergency Maintenance', code: 'DT-EMAINT' },
    { kind: 'downtimeReason', name: 'Material Delay', code: 'DT-MAT' },
    { kind: 'downtimeReason', name: 'Operator Break', code: 'DT-OPB' },
    { kind: 'downtimeReason', name: 'Quality Issue', code: 'DT-QI' },
    { kind: 'downtimeReason', name: 'Tool Change', code: 'DT-TOOL' },
    { kind: 'downtimeReason', name: 'Setup/Adjustment', code: 'DT-SETUP' },
    { kind: 'downtimeReason', name: 'Material Shortage', code: 'DT-MATSHORT' },
    { kind: 'downtimeReason', name: 'Other', code: 'DT-OTHER' },
    // Defect Types - severity levels
    { kind: 'defectType', name: 'Critical', code: 'DEF-CRIT' },
    { kind: 'defectType', name: 'Major', code: 'DEF-MAJ' },
    { kind: 'defectType', name: 'Minor', code: 'DEF-MIN' },
    // Product Types - with variety
    { kind: 'product', name: 'Product A', code: 'PRD-A' },
    { kind: 'product', name: 'Product B', code: 'PRD-B' },
    { kind: 'product', name: 'Product C', code: 'PRD-C' },
    { kind: 'product', name: 'Product D', code: 'PRD-D' },
  ];

  // Create a map to store created items for parent relationships
  const itemMap = new Map();

  for (const item of defaults) {
    const exists = await MasterItem.findOne({ kind: item.kind, name: item.name });
    if (!exists) {
      const created = await MasterItem.create(item);
      itemMap.set(`${item.kind}:${item.name}`, created._id);
    } else {
      itemMap.set(`${item.kind}:${item.name}`, exists._id);
    }
  }

  // Create hierarchical items (Lines, Machines, Processes, Operators)
  const deptAssembly = itemMap.get('department:Assembly');
  const deptQC = itemMap.get('department:Quality Control');
  const deptPackaging = itemMap.get('department:Packaging');
  const deptProduction = itemMap.get('department:Production');
  const deptMaintenance = itemMap.get('department:Maintenance');

  const hierarchicalDefaults = [
    // Lines under Assembly
    { kind: 'line', name: 'Line 1', code: 'L1', departmentId: deptAssembly },
    { kind: 'line', name: 'Line 2', code: 'L2', departmentId: deptAssembly },
    { kind: 'line', name: 'Line 3', code: 'L3', departmentId: deptProduction },
    { kind: 'line', name: 'Line 4', code: 'L4', departmentId: deptPackaging },
    { kind: 'line', name: 'Line QC-1', code: 'LQC1', departmentId: deptQC },
    // Machines under lines
    { kind: 'machine', name: 'Machine 1A', code: 'M1A', lineId: null, departmentId: deptAssembly },
    { kind: 'machine', name: 'Machine 1B', code: 'M1B', lineId: null, departmentId: deptAssembly },
    { kind: 'machine', name: 'Machine 2A', code: 'M2A', lineId: null, departmentId: deptAssembly },
    { kind: 'machine', name: 'Machine 3A', code: 'M3A', lineId: null, departmentId: deptProduction },
    { kind: 'machine', name: 'Machine 4A', code: 'M4A', lineId: null, departmentId: deptPackaging },
    // Processes under machines
    { kind: 'process', name: 'Assembly Process A', code: 'PROC-A', machineId: null },
    { kind: 'process', name: 'Assembly Process B', code: 'PROC-B', machineId: null },
    { kind: 'process', name: 'Assembly Process C', code: 'PROC-C', machineId: null },
    { kind: 'process', name: 'Quality Check', code: 'PROC-QC', machineId: null },
    { kind: 'process', name: 'Packaging Process', code: 'PROC-PKG', machineId: null },
    // Operators under departments
    { kind: 'operator', name: 'Operator 1', code: 'OP-1', departmentId: deptAssembly },
    { kind: 'operator', name: 'Operator 2', code: 'OP-2', departmentId: deptAssembly },
    { kind: 'operator', name: 'Operator 3', code: 'OP-3', departmentId: deptProduction },
    { kind: 'operator', name: 'Operator 4', code: 'OP-4', departmentId: deptQC },
    { kind: 'operator', name: 'Operator 5', code: 'OP-5', departmentId: deptPackaging },
    { kind: 'operator', name: 'Operator 6', code: 'OP-6', departmentId: deptQC },
  ];

  for (const item of hierarchicalDefaults) {
    const exists = await MasterItem.findOne({ kind: item.kind, name: item.name });
    if (!exists) {
      const createPayload = { ...item };
      delete createPayload.lineId; // Remove undefined fields
      delete createPayload.machineId;
      if (item.departmentId) createPayload.departmentId = item.departmentId;
      if (item.lineId) createPayload.lineId = item.lineId;
      if (item.machineId) createPayload.machineId = item.machineId;
      await MasterItem.create(createPayload);
    }
  }

  // Seed production entries with realistic data
  const existingEntries = await ProductionEntry.findOne();
  if (!existingEntries) {
    const admin = await User.findOne({ username: ADMIN_USERNAME.toLowerCase() });
    const operator = await User.findOne({ username: 'operator' });
    const adminId = admin?._id;
    const operatorId = operator?._id;

    if (adminId || operatorId) {
      const userId = adminId || operatorId;
      const today = nowDateString();
      const yesterday = previousDateString();
      const dayBeforeYesterday = new Date(new Date(yesterday).setDate(new Date(yesterday).getDate() - 1)).toISOString().slice(0, 10);

      const shiftMorning = itemMap.get('shift:Morning');
      const shiftEvening = itemMap.get('shift:Evening');
      const shiftNight = itemMap.get('shift:Night');
      const deptAssembly = itemMap.get('department:Assembly');
      const deptProduction = itemMap.get('department:Production');
      const deptPackaging = itemMap.get('department:Packaging');

      // Get all machines, lines, operators, processes, products
      const line1 = await MasterItem.findOne({ kind: 'line', name: 'Line 1' });
      const line2 = await MasterItem.findOne({ kind: 'line', name: 'Line 2' });
      const line3 = await MasterItem.findOne({ kind: 'line', name: 'Line 3' });
      const line4 = await MasterItem.findOne({ kind: 'line', name: 'Line 4' });
      const machine1A = await MasterItem.findOne({ kind: 'machine', name: 'Machine 1A' });
      const machine1B = await MasterItem.findOne({ kind: 'machine', name: 'Machine 1B' });
      const machine2A = await MasterItem.findOne({ kind: 'machine', name: 'Machine 2A' });
      const machine3A = await MasterItem.findOne({ kind: 'machine', name: 'Machine 3A' });
      const machine4A = await MasterItem.findOne({ kind: 'machine', name: 'Machine 4A' });
      const processA = await MasterItem.findOne({ kind: 'process', name: 'Assembly Process A' });
      const processB = await MasterItem.findOne({ kind: 'process', name: 'Assembly Process B' });
      const processQC = await MasterItem.findOne({ kind: 'process', name: 'Quality Check' });
      const processPKG = await MasterItem.findOne({ kind: 'process', name: 'Packaging Process' });

      const [op1, op2, op3, op4, op5, op6] = await Promise.all([
        MasterItem.findOne({ kind: 'operator', name: 'Operator 1' }),
        MasterItem.findOne({ kind: 'operator', name: 'Operator 2' }),
        MasterItem.findOne({ kind: 'operator', name: 'Operator 3' }),
        MasterItem.findOne({ kind: 'operator', name: 'Operator 4' }),
        MasterItem.findOne({ kind: 'operator', name: 'Operator 5' }),
        MasterItem.findOne({ kind: 'operator', name: 'Operator 6' }),
      ]);

      const productA = itemMap.get('product:Product A');
      const productB = itemMap.get('product:Product B');
      const productC = itemMap.get('product:Product C');
      const productD = itemMap.get('product:Product D');

      // Comprehensive realistic production entries
      const sampleEntries = [
        // Day Before Yesterday - Complete data
        { date: dayBeforeYesterday, shiftId: shiftMorning, departmentId: deptAssembly, lineId: line1?._id, machineId: machine1A?._id, processId: processA?._id, operatorId: op1?._id, productId: productA, plannedQty: 520, hourlyInputs: [45, 47, 46, 48, 49, 47, 48, 46, 0, 0, 0, 0], rejectQty: 12, reworkQty: 6, downtimeMinutes: 30, downtimeReasonId: itemMap.get('downtimeReason:Tool Change'), remarks: 'Machine calibration done. Production optimal.', status: 'locked', createdBy: userId, updatedBy: userId },
        { date: dayBeforeYesterday, shiftId: shiftMorning, departmentId: deptAssembly, lineId: line1?._id, machineId: machine1B?._id, processId: processA?._id, operatorId: op2?._id, productId: productA, plannedQty: 500, hourlyInputs: [43, 45, 44, 46, 48, 45, 47, 45, 0, 0, 0, 0], rejectQty: 10, reworkQty: 5, downtimeMinutes: 45, downtimeReasonId: itemMap.get('downtimeReason:Material Delay'), remarks: 'Material arrived late, adjusted schedule.', status: 'locked', createdBy: userId, updatedBy: userId },
        { date: dayBeforeYesterday, shiftId: shiftMorning, departmentId: deptProduction, lineId: line3?._id, machineId: machine3A?._id, processId: processB?._id, operatorId: op3?._id, productId: productB, plannedQty: 480, hourlyInputs: [42, 44, 43, 45, 46, 44, 45, 43, 0, 0, 0, 0], rejectQty: 8, reworkQty: 4, downtimeMinutes: 20, downtimeReasonId: null, remarks: 'Normal operations, steady output.', status: 'locked', createdBy: userId, updatedBy: userId },
        { date: dayBeforeYesterday, shiftId: shiftEvening, departmentId: deptAssembly, lineId: line1?._id, machineId: machine1A?._id, processId: processA?._id, operatorId: op1?._id, productId: productA, plannedQty: 510, hourlyInputs: [46, 48, 47, 49, 50, 48, 49, 0, 0, 0, 0, 0], rejectQty: 14, reworkQty: 7, downtimeMinutes: 60, downtimeReasonId: itemMap.get('downtimeReason:Machine Breakdown'), remarks: 'Minor breakdown fixed by maintenance team.', status: 'locked', createdBy: userId, updatedBy: userId },
        { date: dayBeforeYesterday, shiftId: shiftEvening, departmentId: deptPackaging, lineId: line4?._id, machineId: machine4A?._id, processId: processPKG?._id, operatorId: op5?._id, productId: productC, plannedQty: 450, hourlyInputs: [40, 42, 41, 43, 44, 42, 43, 0, 0, 0, 0, 0], rejectQty: 6, reworkQty: 3, downtimeMinutes: 15, downtimeReasonId: null, remarks: 'Smooth packaging operations.', status: 'locked', createdBy: userId, updatedBy: userId },

        // Yesterday - Recent data
        { date: yesterday, shiftId: shiftMorning, departmentId: deptAssembly, lineId: line1?._id, machineId: machine1A?._id, processId: processA?._id, operatorId: op1?._id, productId: productA, plannedQty: 530, hourlyInputs: [46, 48, 47, 50, 49, 48, 49, 47, 0, 0, 0, 0], rejectQty: 13, reworkQty: 6, downtimeMinutes: 25, downtimeReasonId: null, remarks: 'Excellent morning shift performance.', status: 'locked', createdBy: userId, updatedBy: userId },
        { date: yesterday, shiftId: shiftMorning, departmentId: deptAssembly, lineId: line2?._id, machineId: machine2A?._id, processId: processB?._id, operatorId: op2?._id, productId: productB, plannedQty: 490, hourlyInputs: [44, 46, 45, 47, 48, 46, 47, 45, 0, 0, 0, 0], rejectQty: 11, reworkQty: 5, downtimeMinutes: 35, downtimeReasonId: itemMap.get('downtimeReason:Setup/Adjustment'), remarks: 'Line adjustment for new product batch.', status: 'locked', createdBy: userId, updatedBy: userId },
        { date: yesterday, shiftId: shiftMorning, departmentId: deptProduction, lineId: line3?._id, machineId: machine3A?._id, processId: processB?._id, operatorId: op3?._id, productId: productB, plannedQty: 500, hourlyInputs: [45, 47, 46, 48, 49, 47, 48, 46, 0, 0, 0, 0], rejectQty: 12, reworkQty: 6, downtimeMinutes: 40, downtimeReasonId: itemMap.get('downtimeReason:Quality Issue'), remarks: 'Quality check adjustments made.', status: 'locked', createdBy: userId, updatedBy: userId },
        { date: yesterday, shiftId: shiftEvening, departmentId: deptAssembly, lineId: line1?._id, machineId: machine1B?._id, processId: processA?._id, operatorId: op2?._id, productId: productA, plannedQty: 520, hourlyInputs: [47, 49, 48, 50, 51, 49, 50, 0, 0, 0, 0, 0], rejectQty: 15, reworkQty: 7, downtimeMinutes: 20, downtimeReasonId: null, remarks: 'Evening shift peak performance.', status: 'locked', createdBy: userId, updatedBy: userId },
        { date: yesterday, shiftId: shiftEvening, departmentId: deptProduction, lineId: line3?._id, machineId: machine3A?._id, processId: processB?._id, operatorId: op3?._id, productId: productB, plannedQty: 510, hourlyInputs: [46, 48, 47, 49, 50, 48, 49, 0, 0, 0, 0, 0], rejectQty: 13, reworkQty: 6, downtimeMinutes: 30, downtimeReasonId: null, remarks: 'Consistent quality maintained.', status: 'locked', createdBy: userId, updatedBy: userId },
        { date: yesterday, shiftId: shiftNight, departmentId: deptPackaging, lineId: line4?._id, machineId: machine4A?._id, processId: processPKG?._id, operatorId: op5?._id, productId: productC, plannedQty: 460, hourlyInputs: [41, 43, 42, 44, 45, 43, 44, 42, 0, 0, 0, 0], rejectQty: 8, reworkQty: 4, downtimeMinutes: 50, downtimeReasonId: itemMap.get('downtimeReason:Planned Maintenance'), remarks: 'Night shift maintenance window.', status: 'locked', createdBy: userId, updatedBy: userId },

        // Today - Ongoing data
        { date: today, shiftId: shiftMorning, departmentId: deptAssembly, lineId: line1?._id, machineId: machine1A?._id, processId: processA?._id, operatorId: op1?._id, productId: productA, plannedQty: 520, hourlyInputs: [46, 48, 47, 49, 0, 0, 0, 0, 0, 0, 0, 0], rejectQty: 10, reworkQty: 5, downtimeMinutes: 15, downtimeReasonId: null, remarks: 'Morning production ongoing. Target on track.', status: 'submitted', createdBy: userId, updatedBy: userId },
        { date: today, shiftId: shiftMorning, departmentId: deptAssembly, lineId: line2?._id, machineId: machine2A?._id, processId: processB?._id, operatorId: op2?._id, productId: productB, plannedQty: 500, hourlyInputs: [44, 46, 45, 47, 0, 0, 0, 0, 0, 0, 0, 0], rejectQty: 9, reworkQty: 4, downtimeMinutes: 25, downtimeReasonId: null, remarks: 'Good start to the day.', status: 'submitted', createdBy: userId, updatedBy: userId },
        { date: today, shiftId: shiftMorning, departmentId: deptProduction, lineId: line3?._id, machineId: machine3A?._id, processId: processB?._id, operatorId: op3?._id, productId: productB, plannedQty: 510, hourlyInputs: [45, 47, 46, 48, 0, 0, 0, 0, 0, 0, 0, 0], rejectQty: 11, reworkQty: 5, downtimeMinutes: 20, downtimeReasonId: null, remarks: 'Production line stable.', status: 'submitted', createdBy: userId, updatedBy: userId },
      ];

      for (const entry of sampleEntries) {
        const exists = await ProductionEntry.findOne({
          date: entry.date,
          lineId: entry.lineId,
          machineId: entry.machineId,
          shiftId: entry.shiftId,
          operatorId: entry.operatorId,
        });
        if (!exists) {
          const metrics = calculateMetrics(entry);
          await ProductionEntry.create({
            ...entry,
            ...metrics,
            editedCells: [],
            editLogs: [],
          });
        }
      }
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
