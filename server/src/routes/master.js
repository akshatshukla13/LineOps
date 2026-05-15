import { Router } from 'express';
import { MasterItem } from '../models/index.js';
import { authMiddleware, requireRole } from '../middleware/auth.js';
import { recordAudit } from '../services/auditService.js';
import { MASTER_KINDS } from '../config/constants.js';
import { isValidMasterKind, asObjectIdOrNull, isValidObjectId } from '../utils/validators.js';

const router = Router();

router.get('/:kind', authMiddleware, async (req, res) => {
  const { kind } = req.params;
  const { active, lineId, machineId, departmentId } = req.query;

  if (!isValidMasterKind(kind)) {
    return res.status(400).json({ error: 'Invalid master kind.' });
  }

  const safeKind = MASTER_KINDS.find((item) => item === kind);
  const query = { kind: safeKind, active: active === 'false' ? false : true };

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

router.post('/:kind', authMiddleware, requireRole('admin'), async (req, res) => {
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

router.put('/:kind/:id', authMiddleware, requireRole('admin'), async (req, res) => {
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

router.delete('/:kind/:id', authMiddleware, requireRole('admin'), async (req, res) => {
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

router.post('/import', authMiddleware, requireRole('admin'), async (req, res) => {
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

export default router;
