import mongoose from 'mongoose';
import { pathToFileURL } from 'node:url';
import xlsx from 'xlsx';
import { ensureDbConnection } from './connection.js';
import { seedInitialData } from './seed.js';
import { ADMIN_USERNAME, MONGODB_DB_NAME } from '../config/env.js';
import { MasterItem, ProductionEntry, User } from '../models/index.js';
import { calculateMetrics, normalizeHourlyInputs } from '../utils/helpers.js';

const DEFAULT_WORKBOOK_PATH =
  'C:/Users/SSC/OneDrive/Desktop/hydroquipda/Daily Monitoring System Hourly (1) (Autosaved) (1).xlsx';

const WORKBOOK_SOURCE = 'Daily Monitoring System Hourly (1) (Autosaved) (1).xlsx';
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

// ---------------------------------------------------------------------------
// Fast master-item resolution using an in-memory cache.
// After the DB is wiped we build everything from scratch, so we can keep an
// authoritative in-memory Map and only hit MongoDB when we need to persist a
// new document.
// ---------------------------------------------------------------------------

/**
 * Build a composite cache key.
 * @param {string} kind
 * @param {string} code
 * @returns {string}
 */
const masterKey = (kind, code) => `${kind}::${code}`;

/**
 * Ensure a MasterItem exists, returning its document.
 * Uses `cache` (Map<string, document>) to avoid redundant DB round-trips.
 */
const ensureMaster = async (cache, { kind, name, code, active = true, ...parents }) => {
  const key = masterKey(kind, code);
  if (cache.has(key)) return cache.get(key);

  // Not in cache – upsert into DB
  const doc = await MasterItem.findOneAndUpdate(
    { kind, code },
    { $setOnInsert: { kind, name, code, active, ...parents } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  cache.set(key, doc);
  return doc;
};

const importWorkbook = async (workbookPath) => {
  await ensureDbConnection();

  // Full reset before seeding
  console.log('Dropping ProductionEntry and MasterItem collections…');
  await ProductionEntry.deleteMany({});
  await MasterItem.deleteMany({});

  await seedInitialData();

  const admin = await User.findOne({ username: ADMIN_USERNAME.toLowerCase() });
  if (!admin) {
    throw new Error(`Admin user "${ADMIN_USERNAME}" was not found after seeding.`);
  }

  // ── 1. Parse the workbook ────────────────────────────────────────────────
  console.log(`Reading workbook: ${workbookPath}`);
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

  console.log(`Parsed ${productionRows.length} production rows from workbook.`);

  // ── 2. Build master items (cached, no redundant DB trips) ────────────────
  console.log('Resolving master items…');
  const cache = new Map();

  // Pre-load any master items already seeded (shifts, operators, etc.)
  const seeded = await MasterItem.find({});
  for (const doc of seeded) {
    if (doc.code) cache.set(masterKey(doc.kind, doc.code), doc);
  }

  // Resolve per-row masters sequentially (respects parent→child ordering)
  const resolved = [];
  for (const row of productionRows) {
    const { name: lineName, code: lineCode } = lineDetails(row.sheetLineNo);
    const lineDoc = await ensureMaster(cache, {
      kind: 'line',
      name: lineName,
      code: lineCode,
      active: true,
    });

    const machineCode = `${lineDoc.code}-${toCodePart(row.machineName, 'MACHINE')}`;
    const machineDoc = await ensureMaster(cache, {
      kind: 'machine',
      name: row.machineName,
      code: machineCode,
      active: true,
      lineId: lineDoc._id,
      departmentId: null,
    });

    const processCode = `${machineDoc.code}-${toCodePart(row.processName, 'PROCESS')}`;
    const processDoc = await ensureMaster(cache, {
      kind: 'process',
      name: row.processName,
      code: processCode,
      active: true,
      machineId: machineDoc._id,
    });

    const operatorName = cleanText(row.operatorName) || 'NA';
    const operatorCode = `OP-${toCodePart(operatorName, 'NA')}`;
    const operatorDoc = await ensureMaster(cache, {
      kind: 'operator',
      name: operatorName,
      code: operatorCode,
      active: true,
    });

    const shiftCode = cleanText(row.shiftValue).toUpperCase() || 'UNASSIGNED';
    const shiftName = shiftCode === 'UNASSIGNED' ? 'Unassigned' : `Shift ${shiftCode}`;
    const shiftDoc = await ensureMaster(cache, {
      kind: 'shift',
      name: shiftName,
      code: shiftCode,
      active: true,
    });

    resolved.push({ row, lineDoc, machineDoc, processDoc, operatorDoc, shiftDoc });
  }

  console.log(`Master items resolved. Unique items in cache: ${cache.size}`);

  // ── 3. Build ProductionEntry documents and insertMany in batches ─────────
  console.log('Building and inserting production entries…');
  const BATCH_SIZE = 500;
  let imported = 0;
  const summary = new Map();

  const buildDoc = ({ row, lineDoc, machineDoc, processDoc, operatorDoc, shiftDoc }) => {
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
    return entry;
  };

  for (let i = 0; i < resolved.length; i += BATCH_SIZE) {
    const batch = resolved.slice(i, i + BATCH_SIZE);
    const docs = batch.map(buildDoc);
    await ProductionEntry.insertMany(docs, { ordered: false });
    imported += docs.length;
    for (const { row } of batch) {
      summary.set(row.sheetName, (summary.get(row.sheetName) || 0) + 1);
    }
    console.log(`  Inserted ${imported} / ${resolved.length} entries…`);
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
