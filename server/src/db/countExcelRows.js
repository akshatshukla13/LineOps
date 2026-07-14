import xlsx from 'xlsx';

const WORKBOOK_PATH =
  'C:/Users/SSC/OneDrive/Desktop/hydroquipda/Daily Monitoring System Hourly NEW.xlsx';
const DATE_SHEET_PATTERN = /^(\d{2})\.(\d{2})\.(\d{4})$/;

const cleanText = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();
const rowHasData = (row) =>
  Boolean(cleanText(row[5])) ||
  row.slice(8, 20).some((v) => cleanText(v) !== '') ||
  [20, 21, 22, 23, 24, 26].some((i) => cleanText(row[i]) !== '');

const workbook = xlsx.readFile(WORKBOOK_PATH, { cellDates: true });
let total = 0;
const summary = [];

for (const sheetName of workbook.SheetNames) {
  if (!DATE_SHEET_PATTERN.test(sheetName)) {
    console.log(`  [SKIP - non-date sheet]: ${sheetName}`);
    continue;
  }
  const rows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], {
    header: 1, defval: null, blankrows: false, raw: false,
  });
  const count = rows
    .slice(3)
    .filter(
      (row) =>
        cleanText(row[0]) && cleanText(row[1]) && cleanText(row[2]) && rowHasData(row),
    ).length;
  summary.push({ sheet: sheetName, entries: count });
  total += count;
}

console.log('\nAll sheets in this workbook:');
workbook.SheetNames.forEach((s) => console.log(`  "${s}"`));
console.log('\nDate sheets with entry counts:');
summary.forEach((s) => console.log(`  ${s.sheet}: ${s.entries}`));
console.log(`\nTOTAL DATE SHEETS : ${summary.length}`);
console.log(`TOTAL ENTRIES     : ${total}`);
