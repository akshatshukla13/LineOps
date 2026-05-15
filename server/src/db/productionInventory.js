/**
 * Production line inventory (May 2026) — lines, machines, and processes.
 * Machine/process names may repeat across lines; codes are unique per row.
 */
export const PRODUCTION_INVENTORY = [
  {
    lineNo: '1',
    lineName: 'Line 1',
    code: 'L1',
    machines: [
      { name: 'Lathe', processes: ['Grooving'] },
      { name: 'Flaring', processes: ['Flaring'] },
      { name: 'CNC Bending', processes: ['Bending'] },
      { name: 'Welding', processes: ['Welding'] },
      { name: 'Testing', processes: ['Leak Testing'] },
      { name: 'Auto Welding', processes: ['Welding'] },
    ],
  },
  {
    lineNo: '2',
    lineName: 'Line 2',
    code: 'L2',
    machines: [
      { name: 'Flaring', processes: ['Flaring'] },
      { name: 'CNC Bending', processes: ['Bending'] },
      { name: 'Torch Brazing', processes: ['Brazing'] },
      { name: 'Welding', processes: ['Tagging / Welding'] },
      { name: 'Testing', processes: ['Leak Testing'] },
      { name: 'Crimping', processes: ['HP Crimping'] },
    ],
  },
  {
    lineNo: '3',
    lineName: 'Line 3',
    code: 'L3',
    machines: [
      { name: 'Engraving marking', processes: ['Marking'] },
      { name: 'Induction Brazing', processes: ['Brazing'] },
      { name: 'CNC Bending', processes: ['Bending'] },
      { name: 'Torch Brazing', processes: ['Brazing'] },
      { name: 'Testing', processes: ['Leak Testing'] },
      { name: 'Flaring', processes: ['Flaring'] },
      { name: 'Manual Bending', processes: ['Bending'] },
      { name: 'Crimping', processes: ['LP Crimping'] },
    ],
  },
  {
    lineNo: '4',
    lineName: 'Line 4',
    code: 'L4',
    machines: [
      { name: 'Flaring', processes: ['Flaring'] },
      { name: 'Induction Brazing', processes: ['Brazing'] },
      { name: 'CNC Bending', processes: ['Bending'] },
      { name: 'Testing', processes: ['Leak Testing'] },
      { name: 'Crimping', processes: ['CC Crimping'] },
      { name: 'Engraving marking', processes: ['Marking'] },
    ],
  },
  {
    lineNo: '5',
    lineName: 'Line 5',
    code: 'L5',
    machines: [
      { name: 'Flaring', processes: ['Flaring'] },
      { name: 'Induction Brazing', processes: ['Brazing'] },
      { name: 'CNC Bending', processes: ['Bending'] },
      { name: 'Welding', processes: ['Tagging / Welding'] },
      { name: 'Torch Brazing', processes: ['Brazing'] },
      { name: 'Testing', processes: ['Leak Testing'] },
      { name: 'Marking & Assly.', processes: ['Clip Assly.'] },
      { name: 'Flow Testing', processes: ['Flow'] },
    ],
  },
  {
    lineNo: 'F',
    lineName: 'Line F',
    code: 'LF',
    machines: [{ name: 'Furnace', processes: ['Brazing'] }],
  },
];

const slug = (value) =>
  String(value)
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

export const machineCode = (lineCode, machineName, index) =>
  `${lineCode}-${slug(machineName) || `M${index + 1}`}`;

export const processCode = (machineCodeValue, processName, index) =>
  `${machineCodeValue}-${slug(processName) || `P${index + 1}`}`;
