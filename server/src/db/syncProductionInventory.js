import { MasterItem } from '../models/index.js';
import {
  PRODUCTION_INVENTORY,
  machineCode,
  processCode,
} from './productionInventory.js';

const LEGACY_LINE_CODES = new Set(['LQC1']);

const dropLegacyMasterIndexes = async () => {
  const legacyIndexNames = [
    'kind_1_name_1',
    'kind_1_lineId_1_name_1',
    'kind_1_machineId_1_name_1',
  ];

  for (const indexName of legacyIndexNames) {
    try {
      await MasterItem.collection.dropIndex(indexName);
    } catch {
      // Index may not exist yet.
    }
  }

  await MasterItem.syncIndexes();
};

const upsertLine = async (lineRow) => {
  let lineDoc = await MasterItem.findOne({
    kind: 'line',
    $or: [{ code: lineRow.code }, { name: lineRow.lineName }],
  }).sort({ active: -1, updatedAt: -1 });

  if (lineDoc) {
    lineDoc.name = lineRow.lineName;
    lineDoc.code = lineRow.code;
    lineDoc.active = true;
    lineDoc.departmentId = null;
    await lineDoc.save();
  } else {
    lineDoc = await MasterItem.create({
      kind: 'line',
      name: lineRow.lineName,
      code: lineRow.code,
      active: true,
    });
  }

  await MasterItem.updateMany(
    {
      kind: 'line',
      name: lineRow.lineName,
      _id: { $ne: lineDoc._id },
    },
    { $set: { active: false } },
  );

  return lineDoc;
};

const upsertMachine = async (machineRow, mCode, lineId) => {
  let machineDoc = await MasterItem.findOne({
    kind: 'machine',
    $or: [{ code: mCode }, { name: machineRow.name, lineId }],
  }).sort({ active: -1, updatedAt: -1 });

  if (machineDoc) {
    machineDoc.name = machineRow.name;
    machineDoc.code = mCode;
    machineDoc.lineId = lineId;
    machineDoc.active = true;
    machineDoc.departmentId = null;
    await machineDoc.save();
  } else {
    machineDoc = await MasterItem.create({
      kind: 'machine',
      name: machineRow.name,
      code: mCode,
      lineId,
      active: true,
    });
  }

  await MasterItem.updateMany(
    {
      kind: 'machine',
      lineId,
      name: machineRow.name,
      _id: { $ne: machineDoc._id },
    },
    { $set: { active: false } },
  );

  return machineDoc;
};

const upsertProcess = async (processName, pCode, machineId) => {
  let processDoc = await MasterItem.findOne({
    kind: 'process',
    $or: [{ code: pCode }, { name: processName, machineId }],
  }).sort({ active: -1, updatedAt: -1 });

  if (processDoc) {
    processDoc.name = processName;
    processDoc.code = pCode;
    processDoc.machineId = machineId;
    processDoc.active = true;
    await processDoc.save();
  } else {
    processDoc = await MasterItem.create({
      kind: 'process',
      name: processName,
      code: pCode,
      machineId,
      active: true,
    });
  }

  await MasterItem.updateMany(
    {
      kind: 'process',
      machineId,
      name: processName,
      _id: { $ne: processDoc._id },
    },
    { $set: { active: false } },
  );

  return processDoc;
};

export const syncProductionInventory = async () => {
  await dropLegacyMasterIndexes();

  const expectedLineCodes = new Set(PRODUCTION_INVENTORY.map((row) => row.code));
  const expectedMachineCodes = new Set();
  const expectedProcessCodes = new Set();

  const lineIdByCode = new Map();

  for (const lineRow of PRODUCTION_INVENTORY) {
    const lineDoc = await upsertLine(lineRow);
    lineIdByCode.set(lineRow.code, lineDoc._id);

    lineRow.machines.forEach((machineRow, machineIndex) => {
      const mCode = machineCode(lineRow.code, machineRow.name, machineIndex);
      expectedMachineCodes.add(mCode);

      machineRow.processes.forEach((processName, processIndex) => {
        expectedProcessCodes.add(processCode(mCode, processName, processIndex));
      });
    });
  }

  for (const lineRow of PRODUCTION_INVENTORY) {
    const lineId = lineIdByCode.get(lineRow.code);
    if (!lineId) continue;

    for (let machineIndex = 0; machineIndex < lineRow.machines.length; machineIndex += 1) {
      const machineRow = lineRow.machines[machineIndex];
      const mCode = machineCode(lineRow.code, machineRow.name, machineIndex);
      const machineDoc = await upsertMachine(machineRow, mCode, lineId);

      for (let processIndex = 0; processIndex < machineRow.processes.length; processIndex += 1) {
        const processName = machineRow.processes[processIndex];
        const pCode = processCode(mCode, processName, processIndex);
        await upsertProcess(processName, pCode, machineDoc._id);
      }
    }
  }

  await MasterItem.updateMany(
    {
      kind: 'line',
      code: { $nin: [...expectedLineCodes, ...LEGACY_LINE_CODES] },
    },
    { $set: { active: false } },
  );

  await MasterItem.updateMany(
    { kind: 'line', code: { $in: [...LEGACY_LINE_CODES] } },
    { $set: { active: false } },
  );

  await MasterItem.updateMany(
    {
      kind: 'machine',
      $or: [
        { code: { $nin: [...expectedMachineCodes] } },
        { name: { $regex: /^Machine / } },
        { lineId: null },
      ],
    },
    { $set: { active: false } },
  );

  await MasterItem.updateMany(
    {
      kind: 'process',
      $or: [
        { code: { $nin: [...expectedProcessCodes] } },
        { name: { $in: ['Assembly Process A', 'Assembly Process B', 'Assembly Process C', 'Quality Check', 'Packaging Process'] } },
        { machineId: null },
      ],
    },
    { $set: { active: false } },
  );

  await MasterItem.updateMany({ kind: 'department' }, { $set: { active: false } });
  await MasterItem.updateMany({ kind: 'product' }, { $set: { active: false } });
};
