import { Router } from 'express';
import { ProductionEntry, MasterItem } from '../models/index.js';
import { authMiddleware } from '../middleware/auth.js';
import { isValidDateString, asObjectIdOrNull } from '../utils/validators.js';

const router = Router();

const MONITORING_HOUR_COUNT = 12;

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

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const toMonitoringExportRow = (entry, index) => {
  const hourlyInputs = [...(entry.hourlyInputs || []), ...Array(MONITORING_HOUR_COUNT).fill('')].slice(0, MONITORING_HOUR_COUNT);
  const total = entry.totalProduction ?? hourlyInputs.reduce((sum, value) => sum + Number(value || 0), 0);

  return {
    id: String(entry._id),
    sno: index + 1,
    date: formatDisplayDate(entry.date),
    line: entry.sheetLineNo || entry.lineId?.code || entry.lineId?.name?.replace(/\D+/g, '') || getMasterLabel(entry.lineId, '-'),
    machine: getMasterLabel(entry.machineId),
    operator: getMasterLabel(entry.operatorId),
    process: getMasterLabel(entry.processId),
    shift: entry.sheetShift ?? getShiftCode(entry.shiftId),
    hours: entry.scheduledHours ?? 8,
    target: entry.plannedQty ?? 0,
    hourlyInputs,
    total,
    rejected: entry.rejectQty || '',
    rework: entry.reworkQty || '',
    downtime: entry.downtimeMinutes || '',
    reason: entry.downtimeOtherText || '',
    efficiency: `${Math.round(Number(entry.efficiencyPct || 0))}%`,
    remarks: entry.remarks || '',
  };
};

router.get('/', authMiddleware, async (req, res) => {
  const {
    type = 'monitoring',
    dateMode = 'range',
    from,
    to,
    shiftId,
    machineId,
    lineId,
    processId,
    operatorName,
  } = req.query;

  if (type !== 'monitoring') {
    return res.status(400).json({ error: 'Only monitoring reports are supported.' });
  }

  const query = {};

  if (dateMode !== 'all') {
    if (from || to) {
      query.date = {};
      if (from) {
        if (!isValidDateString(from)) return res.status(400).json({ error: 'Invalid from date.' });
        query.date.$gte = new Date(`${from}T00:00:00.000Z`);
      }
      if (to) {
        if (!isValidDateString(to)) return res.status(400).json({ error: 'Invalid to date.' });
        query.date.$lte = new Date(`${to}T23:59:59.999Z`);
      }
    }
  }

  const idFilters = { shiftId, machineId, lineId, processId };
  for (const [field, rawValue] of Object.entries(idFilters)) {
    if (!rawValue) continue;
    const sanitizedId = asObjectIdOrNull(rawValue);
    if (!sanitizedId) return res.status(400).json({ error: `Invalid ${field}.` });
    query[field] = sanitizedId;
  }

  const operatorSearch = String(operatorName || '').trim();
  if (operatorSearch) {
    const matchingOperators = await MasterItem.find({
      kind: 'operator',
      name: { $regex: escapeRegex(operatorSearch), $options: 'i' },
    })
      .select('_id')
      .lean();

    if (!matchingOperators.length) {
      return res.json({
        type: 'monitoring',
        totalRows: 0,
        page: 1,
        pages: 1,
        report: [],
        spreadsheetRows: [],
        sourceCount: 0,
      });
    }

    query.operatorId = { $in: matchingOperators.map((item) => item._id) };
  }

  if (req.user.role === 'operator') {
    query.createdBy = req.user._id;
  }

  if (req.user.role === 'supervisor' && req.user.assignedLines?.length) {
    if (query.lineId) {
      const allowed = req.user.assignedLines.some((id) => String(id) === String(query.lineId));
      if (!allowed) {
        return res.status(403).json({ error: 'You cannot view this line.' });
      }
    } else {
      query.lineId = { $in: req.user.assignedLines };
    }
  }

  // ── Pagination ─────────────────────────────────────────────────────────────
  const rawPage = parseInt(req.query.page, 10);
  const rawLimit = parseInt(req.query.limit, 10);
  const page = rawPage > 0 ? rawPage : 1;
  const limit = rawLimit > 0 && rawLimit <= 500 ? rawLimit : 100;
  const skip = (page - 1) * limit;

  const [totalRows, entries] = await Promise.all([
    ProductionEntry.countDocuments(query),
    ProductionEntry.find(query)
      .populate('shiftId', '_id name code')
      .populate('lineId', '_id name code')
      .populate('machineId', '_id name code')
      .populate('processId', '_id name code')
      .populate('operatorId', '_id name code')
      .sort({ date: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
  ]);

  return res.json({
    type: 'monitoring',
    totalRows,
    page,
    pages: Math.ceil(totalRows / limit) || 1,
    report: entries,
    spreadsheetRows: entries.map(toMonitoringExportRow),
    sourceCount: entries.length,
  });
});

export default router;
