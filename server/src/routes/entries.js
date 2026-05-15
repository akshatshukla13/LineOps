import { Router } from 'express';
import { ProductionEntry } from '../models/index.js';
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

  const entries = await ProductionEntry.find(query)
    .sort({ date: -1, createdAt: -1 })
    .populate('createdBy', 'fullName username')
    .lean();

  return res.json(entries);
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
    if (!asObjectIdOrNull(payload[key])) {
      return res.status(400).json({ error: `Invalid ${key}.` });
    }
  }

  const entry = new ProductionEntry({
    date: payload.date,
    shiftId: payload.shiftId,
    departmentId: null,
    lineId: payload.lineId,
    machineId: payload.machineId,
    processId: payload.processId,
    operatorId: payload.operatorId,
    productId: null,
    plannedQty: Number(payload.plannedQty),
    sheetLineNo: payload.sheetLineNo || '',
    scheduledHours: payload.scheduledHours ?? 8,
    sheetShift: payload.sheetShift || '',
    hourlyInputs: normalizeHourlyInputs(payload.hourlyInputs),
    rejectQty: Number(payload.rejectQty || 0),
    reworkQty: Number(payload.reworkQty || 0),
    downtimeMinutes: Number(payload.downtimeMinutes || 0),
    downtimeReasonId: null,
    downtimeOtherText: String(payload.downtimeOtherText || '').trim(),
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
      let newValue = field === 'hourlyInputs'
        ? normalizeHourlyInputs(req.body[field])
        : req.body[field];

      if (field === 'departmentId' || field === 'productId' || field === 'downtimeReasonId') {
        newValue = null;
      }
      if (field === 'downtimeOtherText') {
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
