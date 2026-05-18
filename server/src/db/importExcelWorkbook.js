import mongoose from 'mongoose';
import { pathToFileURL } from 'node:url';
import xlsx from 'xlsx';
import { ensureDbConnection } from './connection.js';
import { seedInitialData } from './seed.js';
import { ADMIN_USERNAME, MONGODB_DB_NAME } from '../config/env.js';
import { MasterItem, ProductionEntry, User } from '../models/index.js';
import { calculateMetrics, normalizeHourlyInputs } from '../utils/helpers.js';

const DEFAULT_WORKBOOK_PATH =
  'c:/Users/SSC/OneDrive/Desktop/abcd/Daily Monitoring System Hourly (1) (Autosaved).xlsx';

const WORKBOOK_SOURCE = 'Daily Monitoring System Hourly (1) (Autosaved).xlsx';
const DATE_SHEET_PATTERN = /^(\d{2})\.(\d{2})\.(\d{4})$/;

const cleanText = (value) =>
  String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();

const toNumber = (value, fallback = 0) => {
  const cleaned = cleanText(value).replace(/,/g, '');
  if (!cleaned) return fallback;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toCodePart = (value, fallback) => {
  const cleaned = cleanText(value)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return cleaned || fallback;
};

const sheetNameToDate = (sheetName) => {
  const match = sheetName.match(DATE_SHEET_PATTERN);
  if (!match) return null;
  const [, day, month, year] = match;
  return `${year}-${month}-${day}`;
};

const lineDetails = (lineNo) => {
  const cleaned = cleanText(lineNo).toUpperCase();
  const codePart = cleaned.replace(/^LINE\s*/i, '');
  return {
    name: `Line ${codePart}`,
    code: codePart === 'F' ? 'LF' : `L${codePart}`,
  };
};

const findMasterByName = (kind, name, parents = {}) =>
  MasterItem.findOne({
    kind,
    name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
    ...parents,
  }).sort({ active: -1, updatedAt: -1 });

const upsertMaster = async ({ kind, name, code = '', active = true, ...parents }) => {
  const trimmedName = cleanText(name);
  if (!trimmedName) return null;

  const query = code
    ? { kind, code }
    : {
        kind,
        name: new RegExp(`^${trimmedName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
        ...parents,
      };

  let doc = await MasterItem.findOne(query).sort({ active: -1, updatedAt: -1 });

  if (!doc && code) {
    doc = await findMasterByName(kind, trimmedName, parents);
  }

  if (!doc) {
    return MasterItem.create({
      kind,
      name: trimmedName,
      code,
      active,
      ...parents,
    });
  }

  doc.name = trimmedName;
  doc.code = code || doc.code || '';
  doc.active = active;
  Object.assign(doc, parents);
  return doc.save();
};

const getShift = async (shiftValue) => {
  const shiftCode = cleanText(shiftValue).toUpperCase() || 'UNASSIGNED';
  const shiftName = shiftCode === 'UNASSIGNED' ? 'Unassigned' : `Shift ${shiftCode}`;
  return upsertMaster({
    kind: 'shift',
    name: shiftName,
    code: shiftCode,
    active: true,
  });
};

const getOperator = async (operatorName) => {
  const name = cleanText(operatorName) || 'NA';
  return upsertMaster({
    kind: 'operator',
    name,
    code: `OP-${toCodePart(name, 'NA')}`,
    active: true,
  });
};

const getLine = async (lineNo) => {
  const details = lineDetails(lineNo);
  return upsertMaster({
    kind: 'line',
    name: details.name,
    code: details.code,
    active: true,
  });
};

const getMachine = async (lineDoc, machineName) =>
  upsertMaster({
    kind: 'machine',
    name: machineName,
    code: `${lineDoc.code}-${toCodePart(machineName, 'MACHINE')}`,
    active: true,
    lineId: lineDoc._id,
    departmentId: null,
  });

const getProcess = async (machineDoc, processName) =>
  upsertMaster({
    kind: 'process',
    name: processName,
    code: `${machineDoc.code}-${toCodePart(processName, 'PROCESS')}`,
    active: true,
    machineId: machineDoc._id,
  });

const rowHasImportableData = (row) => {
  const hasShift = Boolean(cleanText(row[5]));
  const hasHourly = row.slice(8, 20).some((value) => cleanText(value) !== '');
  const hasTotalsOrNotes = [20, 21, 22, 23, 24, 26].some((index) => cleanText(row[index]) !== '');
  return hasShift || hasHourly || hasTotalsOrNotes;
};

const parseProductionRow = (row, sheetName, date, rowNumber) => {
  if (!cleanText(row[0]) || !cleanText(row[1]) || !cleanText(row[2])) {
    return null;
  }

  if (!rowHasImportableData(row)) {
    return null;
  }

  return {
    date,
    sheetName,
    rowNumber,
    sheetLineNo: cleanText(row[1]),
    machineName: cleanText(row[2]),
    operatorName: cleanText(row[3]) || 'NA',
    processName: cleanText(row[4]) || 'Unspecified',
    shiftValue: cleanText(row[5]) || 'Unassigned',
    scheduledHours: cleanText(row[6]) || 8,
    plannedQty: toNumber(row[7]),
    hourlyInputs: normalizeHourlyInputs(row.slice(8, 20).map((value) => toNumber(value))),
    rejectQty: toNumber(row[21]),
    reworkQty: toNumber(row[22]),
    downtimeMinutes: toNumber(row[23]),
    downtimeOtherText: cleanText(row[24]),
    remarks: cleanText(row[26]),
  };
};

const importWorkbook = async (workbookPath) => {
  await ensureDbConnection();
  await seedInitialData();

  const admin = await User.findOne({ username: ADMIN_USERNAME.toLowerCase() });
  if (!admin) {
    throw new Error(`Admin user "${ADMIN_USERNAME}" was not found after seeding.`);
  }

  const workbook = xlsx.readFile(workbookPath, { cellDates: true });
  const productionRows = [];

  for (const sheetName of workbook.SheetNames) {
    const date = sheetNameToDate(sheetName);
    if (!date) continue;

    const rows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], {
      header: 1,
      defval: null,
      blankrows: false,
      raw: false,
    });

    rows.slice(3).forEach((row, index) => {
      const parsed = parseProductionRow(row, sheetName, date, index + 4);
      if (parsed) productionRows.push(parsed);
    });
  }

  await ProductionEntry.deleteMany({ importSource: WORKBOOK_SOURCE });

  let imported = 0;
  const summary = new Map();

  for (const row of productionRows) {
    const lineDoc = await getLine(row.sheetLineNo);
    const machineDoc = await getMachine(lineDoc, row.machineName);
    const processDoc = await getProcess(machineDoc, row.processName);
    const operatorDoc = await getOperator(row.operatorName);
    const shiftDoc = await getShift(row.shiftValue);

    const entry = new ProductionEntry({
      date: row.date,
      shiftId: shiftDoc._id,
      departmentId: null,
      lineId: lineDoc._id,
      machineId: machineDoc._id,
      processId: processDoc._id,
      operatorId: operatorDoc._id,
      productId: null,
      plannedQty: row.plannedQty,
      sheetLineNo: row.sheetLineNo,
      scheduledHours: row.scheduledHours,
      sheetShift: row.shiftValue,
      hourlyInputs: row.hourlyInputs,
      rejectQty: row.rejectQty,
      reworkQty: row.reworkQty,
      downtimeMinutes: row.downtimeMinutes,
      downtimeReasonId: null,
      downtimeOtherText: row.downtimeOtherText,
      remarks: row.remarks,
      importSource: WORKBOOK_SOURCE,
      importRow: row.rowNumber,
      status: 'submitted',
      createdBy: admin._id,
      updatedBy: admin._id,
      editedCells: [],
      editLogs: [],
    });

    Object.assign(entry, calculateMetrics(entry));
    await entry.save();
    imported += 1;
    summary.set(row.sheetName, (summary.get(row.sheetName) || 0) + 1);
  }

  return {
    database: MONGODB_DB_NAME,
    workbookPath,
    imported,
    sheets: Object.fromEntries(summary.entries()),
  };
};

const isDirectExecution = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;

if (isDirectExecution) {
  const workbookPath = process.argv[2] || process.env.EXCEL_IMPORT_FILE || DEFAULT_WORKBOOK_PATH;

  importWorkbook(workbookPath)
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await mongoose.disconnect();
    });
}

export { importWorkbook };
