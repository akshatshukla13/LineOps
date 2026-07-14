import mongoose from 'mongoose';
import xlsx from 'xlsx';
import { ensureDbConnection } from './connection.js';
import { MasterItem, ProductionEntry, User } from '../models/index.js';
import { calculateMetrics, normalizeHourlyInputs } from '../utils/helpers.js';
import { ADMIN_USERNAME, MONGODB_DB_NAME } from '../config/env.js';

const WORKBOOK_PATH =
  'C:/Users/SSC/OneDrive/Desktop/hydroquipda/Daily Monitoring System Hourly (1) (Autosaved) (1)-1.xlsx';
const WORKBOOK_SOURCE = 'Daily Monitoring System Hourly (1) (Autosaved) (1).xlsx';
const TARGET_SHEET = '23.06.2026';
const TARGET_DATE = '2026-06-23';

const cleanText = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();
const toNumber = (v, fb = 0) => {
  const c = cleanText(v).replace(/,/g, '');
  if (!c) return fb;
  const p = Number(c);
  return Number.isFinite(p) ? p : fb;
};
const toCodePart = (v, fb) => {
  const c = cleanText(v).toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '');
  return c || fb;
};
const lineDetails = (ln) => {
  const c = cleanText(ln).toUpperCase();
  const cp = c.replace(/^LINE\s*/i, '');
  return { name: `Line ${cp}`, code: cp === 'F' ? 'LF' : `L${cp}` };
};
const rowHasData = (row) =>
  Boolean(cleanText(row[5])) ||
  row.slice(8, 20).some((v) => cleanText(v) !== '') ||
  [20, 21, 22, 23, 24, 26].some((i) => cleanText(row[i]) !== '');

const parseRow = (row, rowNumber) => {
  if (!cleanText(row[0]) || !cleanText(row[1]) || !cleanText(row[2])) return null;
  if (!rowHasData(row)) return null;
  return {
    sheetLineNo: cleanText(row[1]),
    machineName: cleanText(row[2]),
    operatorName: cleanText(row[3]) || 'NA',
    processName: cleanText(row[4]) || 'Unspecified',
    shiftValue: cleanText(row[5]) || 'Unassigned',
    scheduledHours: cleanText(row[6]) || 8,
    plannedQty: toNumber(row[7]),
    hourlyInputs: normalizeHourlyInputs(row.slice(8, 20).map((v) => toNumber(v))),
    rejectQty: toNumber(row[21]),
    reworkQty: toNumber(row[22]),
    downtimeMinutes: toNumber(row[23]),
    downtimeOtherText: cleanText(row[24]),
    remarks: cleanText(row[26]),
    rowNumber,
  };
};

const masterKey = (kind, code) => `${kind}::${code}`;
const ensureMaster = async (cache, { kind, name, code, active = true, ...parents }) => {
  const key = masterKey(kind, code);
  if (cache.has(key)) return cache.get(key);
  const doc = await MasterItem.findOneAndUpdate(
    { kind, code },
    { $setOnInsert: { kind, name, code, active, ...parents } },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
  );
  cache.set(key, doc);
  return doc;
};

await ensureDbConnection();

const admin = await User.findOne({ username: ADMIN_USERNAME.toLowerCase() });
if (!admin) throw new Error('Admin user not found');

// Parse only the target sheet
const workbook = xlsx.readFile(WORKBOOK_PATH, { cellDates: true });
const sheet = workbook.Sheets[TARGET_SHEET];
if (!sheet) throw new Error(`Sheet "${TARGET_SHEET}" not found in workbook`);

const rows = xlsx.utils.sheet_to_json(sheet, {
  header: 1,
  defval: null,
  blankrows: false,
  raw: false,
});
const parsed = rows.slice(3).map((row, i) => parseRow(row, i + 4)).filter(Boolean);
console.log(`Parsed ${parsed.length} rows from sheet ${TARGET_SHEET}`);

// Delete only entries for this date
const deleted = await ProductionEntry.deleteMany({ date: TARGET_DATE });
console.log(`Deleted ${deleted.deletedCount} existing entries for ${TARGET_DATE}`);

// Load existing master items into cache
const cache = new Map();
const seeded = await MasterItem.find({});
for (const doc of seeded) {
  if (doc.code) cache.set(masterKey(doc.kind, doc.code), doc);
}

// Resolve masters and build entry docs
const docs = [];
for (const row of parsed) {
  const { name: lineName, code: lineCode } = lineDetails(row.sheetLineNo);
  const lineDoc = await ensureMaster(cache, {
    kind: 'line', name: lineName, code: lineCode, active: true,
  });
  const machineCode = `${lineDoc.code}-${toCodePart(row.machineName, 'MACHINE')}`;
  const machineDoc = await ensureMaster(cache, {
    kind: 'machine', name: row.machineName, code: machineCode,
    active: true, lineId: lineDoc._id, departmentId: null,
  });
  const processCode = `${machineDoc.code}-${toCodePart(row.processName, 'PROCESS')}`;
  const processDoc = await ensureMaster(cache, {
    kind: 'process', name: row.processName, code: processCode,
    active: true, machineId: machineDoc._id,
  });
  const opName = cleanText(row.operatorName) || 'NA';
  const operatorDoc = await ensureMaster(cache, {
    kind: 'operator', name: opName, code: `OP-${toCodePart(opName, 'NA')}`, active: true,
  });
  const shiftCode = cleanText(row.shiftValue).toUpperCase() || 'UNASSIGNED';
  const shiftDoc = await ensureMaster(cache, {
    kind: 'shift',
    name: shiftCode === 'UNASSIGNED' ? 'Unassigned' : `Shift ${shiftCode}`,
    code: shiftCode,
    active: true,
  });

  const entry = new ProductionEntry({
    date: TARGET_DATE,
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
  docs.push(entry);
}

await ProductionEntry.insertMany(docs, { ordered: false });
console.log(
  JSON.stringify({ database: MONGODB_DB_NAME, date: TARGET_DATE, imported: docs.length }, null, 2),
);
await mongoose.disconnect();
