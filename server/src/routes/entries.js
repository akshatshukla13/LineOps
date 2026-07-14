import { Router } from 'express';
import { MasterItem, ProductionEntry } from '../models/index.js';
import { authMiddleware, requireRole } from '../middleware/auth.js';
import { canEditEntry } from '../middleware/permissions.js';
import { recordAudit } from '../services/auditService.js';
import {
  normalizeHourlyInputs,
  calculateMetrics,
  nowDateString,
  previousDateString,
} from '../utils/helpers.js';
import {
  isValidObjectId,
  isValidDateString,
  asObjectIdOrNull,
} from '../utils/validators.js';

const router = Router();
const UNSPECIFIED_TOKEN = '__UNSPECIFIED__';

const unspecifiedCode = (kind, parentCode = '') =>
  ['UNSPECIFIED', kind.toUpperCase(), parentCode].filter(Boolean).join('-');

const getOrCreateUnspecifiedMaster = async (kind, parents = {}) => {
  const query = { kind, name: 'Unspecified', ...parents };
  const existing = await MasterItem.findOne(query).sort({ active: -1, updatedAt: -1 });
  if (existing) return existing._id;

  const parentCode = parents.lineId ? String(parents.lineId) : parents.machineId ? String(parents.machineId) : '';
  const created = await MasterItem.create({
    kind,
    name: 'Unspecified',
    code: unspecifiedCode(kind, parentCode.slice(-6)),
    active: true,
    ...parents,
  });
  return created._id;
};

const resolveEntryMasterRefs = async (payload) => {
  const next = { ...payload };

  if (next.shiftId === UNSPECIFIED_TOKEN) {
    next.shiftId = await getOrCreateUnspecifiedMaster('shift');
  }

  if (next.lineId === UNSPECIFIED_TOKEN) {
    next.lineId = await getOrCreateUnspecifiedMaster('line');
  }

  if (next.machineId === UNSPECIFIED_TOKEN) {
    next.machineId = await getOrCreateUnspecifiedMaster('machine', { lineId: next.lineId });
  }

  if (next.processId === UNSPECIFIED_TOKEN) {
    next.processId = await getOrCreateUnspecifiedMaster('process', { machineId: next.machineId });
  }

  if (next.operatorId === UNSPECIFIED_TOKEN) {
    next.operatorId = await getOrCreateUnspecifiedMaster('operator');
  }

  return next;
};

const isResolvableEntryRef = (value) => value === UNSPECIFIED_TOKEN || Boolean(asObjectIdOrNull(value));

router.get('/', authMiddleware, async (req, res) => {
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

  if (req.user.role === 'supervisor' && req.user.assignedLines?.length) {
    query.lineId = { $in: req.user.assignedLines };
  }

  // ── Pagination ────────────────────────────────────────────────────────────
  const rawPage = parseInt(req.query.page, 10);
  const rawLimit = parseInt(req.query.limit, 10);
  const page = rawPage > 0 ? rawPage : 1;
  const limit = rawLimit > 0 && rawLimit <= 500 ? rawLimit : 50;
  const skip = (page - 1) * limit;

  const [total, data] = await Promise.all([
    ProductionEntry.countDocuments(query),
    ProductionEntry.find(query)
      .populate('shiftId', '_id name code')
      .populate('lineId', '_id name code')
      .populate('machineId', '_id name code')
      .populate('processId', '_id name code')
      .populate('operatorId', '_id name code')
      .populate('createdBy', '_id fullName username')
      .sort({ date: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
  ]);

  return res.json({ data, total, page, pages: Math.ceil(total / limit) || 1 });
});

router.post('/', authMiddleware, requireRole('admin', 'supervisor', 'operator'), async (req, res) => {
  const payload = req.body || {};
  const requiredIds = [
    'shiftId',
    'lineId',
    'machineId',
    'processId',
    'operatorId',
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
    if (!isResolvableEntryRef(payload[key])) {
      return res.status(400).json({ error: `Invalid ${key}.` });
    }
  }

  const resolvedPayload = await resolveEntryMasterRefs(payload);

  const entry = new ProductionEntry({
    date: resolvedPayload.date,
    shiftId: resolvedPayload.shiftId,
    departmentId: null,
    lineId: resolvedPayload.lineId,
    machineId: resolvedPayload.machineId,
    processId: resolvedPayload.processId,
    operatorId: resolvedPayload.operatorId,
    productId: null,
    plannedQty: Number(resolvedPayload.plannedQty),
    sheetLineNo: resolvedPayload.sheetLineNo || '',
    scheduledHours: resolvedPayload.scheduledHours ?? 8,
    sheetShift: resolvedPayload.sheetShift || '',
    hourlyInputs: normalizeHourlyInputs(resolvedPayload.hourlyInputs),
    rejectQty: Number(resolvedPayload.rejectQty || 0),
    reworkQty: Number(resolvedPayload.reworkQty || 0),
    rejectReworkReason: String(resolvedPayload.rejectReworkReason || '').trim(),
    downtimeMinutes: Number(resolvedPayload.downtimeMinutes || 0),
    downtimeReason: String(resolvedPayload.downtimeReason || '').trim(),
    downtimeReasonId: null,
    downtimeOtherText: String(resolvedPayload.downtimeOtherText || '').trim(),
    remarks: resolvedPayload.remarks || '',
    importSource: resolvedPayload.importSource || '',
    importRow: resolvedPayload.importRow ?? null,
    status: resolvedPayload.status || 'draft',
    createdBy: req.user._id,
    updatedBy: req.user._id,
    editedCells: [],
  });

  Object.assign(entry, calculateMetrics(entry));
  await entry.save();
  await recordAudit(req.user._id, 'create', 'entry', entry._id, { date: entry.date, status: entry.status });
  return res.status(201).json(entry);
});

router.put('/:id', authMiddleware, requireRole('admin', 'supervisor', 'operator'), async (req, res) => {
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
    'rejectReworkReason',
    'downtimeMinutes',
    'downtimeReason',
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

  const refFields = ['shiftId', 'lineId', 'machineId', 'processId', 'operatorId'];
  for (const field of refFields) {
    if (req.body[field] !== undefined && !isResolvableEntryRef(req.body[field])) {
      return res.status(400).json({ error: `Invalid ${field}.` });
    }
  }

  const resolvedBody = await resolveEntryMasterRefs({
    shiftId: req.body.shiftId ?? entry.shiftId,
    lineId: req.body.lineId ?? entry.lineId,
    machineId: req.body.machineId ?? entry.machineId,
    processId: req.body.processId ?? entry.processId,
    operatorId: req.body.operatorId ?? entry.operatorId,
  });

  const editReason = req.body.editReason || '';
  const changedFields = [];

  editableFields.forEach((field) => {
    if (req.body[field] !== undefined) {
      const oldValue = entry[field];
      let newValue = refFields.includes(field)
        ? resolvedBody[field]
        : field === 'hourlyInputs'
        ? normalizeHourlyInputs(req.body[field])
        : req.body[field];

      if (field === 'departmentId' || field === 'productId' || field === 'downtimeReasonId') {
        newValue = null;
      }
      if (field === 'downtimeOtherText') {
        newValue = String(newValue || '').trim();
      }
      if (field === 'rejectReworkReason' || field === 'downtimeReason') {
        newValue = String(newValue || '').trim();
      }

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

router.delete('/:id', authMiddleware, requireRole('admin'), async (req, res) => {
  if (!isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: 'Invalid entry id.' });
  }

  const entry = await ProductionEntry.findByIdAndDelete(req.params.id);
  if (!entry) {
    return res.status(404).json({ error: 'Entry not found.' });
  }

  await recordAudit(req.user._id, 'delete', 'entry', entry._id, { date: entry.date, status: entry.status });
  return res.json({ ok: true });
});

router.post('/:id/lock', authMiddleware, requireRole('admin'), async (req, res) => {
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

router.post('/:id/unlock', authMiddleware, requireRole('admin'), async (req, res) => {
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

router.post('/clone-previous', authMiddleware, requireRole('admin', 'supervisor', 'operator'), async (req, res) => {
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
    departmentId: null,
    lineId: source.lineId,
    machineId: source.machineId,
    processId: source.processId,
    operatorId: source.operatorId,
    productId: null,
    plannedQty: source.plannedQty,
    sheetLineNo: source.sheetLineNo || '',
    scheduledHours: source.scheduledHours ?? 8,
    sheetShift: source.sheetShift || '',
    hourlyInputs: Array(12).fill(0),
    rejectQty: 0,
    reworkQty: 0,
    downtimeMinutes: 0,
    downtimeReasonId: null,
    downtimeOtherText: source.downtimeOtherText || '',
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

export default router;
