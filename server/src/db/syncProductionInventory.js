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

export const syncProductionInventory = async () => {
  await dropLegacyMasterIndexes();

  const expectedLineCodes = new Set(PRODUCTION_INVENTORY.map((row) => row.code));
  const expectedMachineCodes = new Set();
  const expectedProcessCodes = new Set();

  for (const lineRow of PRODUCTION_INVENTORY) {
    let lineDoc = await MasterItem.findOne({ kind: 'line', code: lineRow.code });
    if (!lineDoc) {
      lineDoc = await MasterItem.create({
        kind: 'line',
        name: lineRow.lineName,
        code: lineRow.code,
        active: true,
      });
    } else {
      lineDoc.name = lineRow.lineName;
      lineDoc.active = true;
      lineDoc.departmentId = null;
      await lineDoc.save();
    }

    lineRow.machines.forEach((machineRow, machineIndex) => {
      const mCode = machineCode(lineRow.code, machineRow.name, machineIndex);
      expectedMachineCodes.add(mCode);

      machineRow.processes.forEach((processName, processIndex) => {
        expectedProcessCodes.add(processCode(mCode, processName, processIndex));
      });
    });
  }

  for (const lineRow of PRODUCTION_INVENTORY) {
    const lineDoc = await MasterItem.findOne({ kind: 'line', code: lineRow.code });
    if (!lineDoc) continue;

    for (let machineIndex = 0; machineIndex < lineRow.machines.length; machineIndex += 1) {
      const machineRow = lineRow.machines[machineIndex];
      const mCode = machineCode(lineRow.code, machineRow.name, machineIndex);
      let machineDoc = await MasterItem.findOne({ kind: 'machine', code: mCode });

      if (!machineDoc) {
        machineDoc = await MasterItem.create({
          kind: 'machine',
          name: machineRow.name,
          code: mCode,
          lineId: lineDoc._id,
          active: true,
        });
      } else {
        machineDoc.name = machineRow.name;
        machineDoc.lineId = lineDoc._id;
        machineDoc.active = true;
        machineDoc.departmentId = null;
        await machineDoc.save();
      }

      for (let processIndex = 0; processIndex < machineRow.processes.length; processIndex += 1) {
        const processName = machineRow.processes[processIndex];
        const pCode = processCode(mCode, processName, processIndex);
        let processDoc = await MasterItem.findOne({ kind: 'process', code: pCode });

        if (!processDoc) {
          await MasterItem.create({
            kind: 'process',
            name: processName,
            code: pCode,
            machineId: machineDoc._id,
            active: true,
          });
        } else {
          processDoc.name = processName;
          processDoc.machineId = machineDoc._id;
          processDoc.active = true;
          await processDoc.save();
        }
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
