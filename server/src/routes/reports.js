import { Router } from 'express';
import { ProductionEntry } from '../models/index.js';
import { authMiddleware, requireRole } from '../middleware/auth.js';
import { isValidObjectId, isValidDateString, asObjectIdOrNull } from '../utils/validators.js';

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

const getSummaryLabel = (type, entry) => {
  if (type === 'daily' || type === 'dateRange') return formatDisplayDate(entry.date);
  if (type === 'line') return getMasterLabel(entry.lineId, entry.lineId?.name || entry.lineId?.code || '-');
  if (type === 'operator') return getMasterLabel(entry.operatorId, entry.operatorId?.name || entry.operatorId?.code || '-');
  if (type === 'machine') return getMasterLabel(entry.machineId, entry.machineId?.name || entry.machineId?.code || '-');
  if (type === 'shift') return getMasterLabel(entry.shiftId, entry.shiftId?.name || entry.shiftId?.code || '-');
  return formatDisplayDate(entry.date);
};

const toMonitoringExportRow = (entry, index) => {
  const hourlyInputs = [...(entry.hourlyInputs || []), ...Array(MONITORING_HOUR_COUNT).fill('')].slice(0, MONITORING_HOUR_COUNT);
  const total = entry.totalProduction ?? hourlyInputs.reduce((sum, value) => sum + Number(value || 0), 0);

  return {
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
    reason: entry.downtimeReasonId?.name || entry.downtimeOtherText || '',
    efficiency: `${Math.round(Number(entry.efficiencyPct || 0))}%`,
    remarks: entry.remarks || '',
  };
};

router.get('/', authMiddleware, async (req, res) => {
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

  // For other report types, return aggregated data with human-readable labels.
  const entries = await ProductionEntry.find(query)
    .populate('shiftId', 'name code')
    .populate('departmentId', 'name code')
    .populate('lineId', 'name code')
    .populate('machineId', 'name code')
    .populate('processId', 'name code')
    .populate('operatorId', 'name code')
    .lean();

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
        label: getSummaryLabel(type, entry),
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

  return res.json({ type, totalRows: report.length, report, spreadsheetRows: report, sourceCount: entries.length });
});

export default router;
