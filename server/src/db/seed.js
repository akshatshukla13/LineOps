import bcrypt from 'bcryptjs';
import { User, MasterItem, ProductionEntry } from '../models/index.js';
import { MASTER_KINDS } from '../config/constants.js';
import { calculateMetrics, nowDateString, previousDateString } from '../utils/helpers.js';
import { ADMIN_USERNAME, ADMIN_PASSWORD, IS_PRODUCTION } from '../config/env.js';

export const seedInitialData = async () => {
  const existingAdmin = await User.findOne({ username: ADMIN_USERNAME.toLowerCase() });

  if (!existingAdmin) {
    const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);
    await User.create({
      fullName: 'System Admin',
      employeeId: 'ADM001',
      username: ADMIN_USERNAME.toLowerCase(),
      passwordHash,
      role: 'admin',
      status: 'active',
    });
  }

  const existingOperator = await User.findOne({ username: 'operator' });

  if (!existingOperator) {
    const passwordHash = await bcrypt.hash('Operator@123', 10);
    await User.create({
      fullName: 'Default Operator',
      employeeId: 'OP001',
      username: 'operator',
      passwordHash,
      role: 'operator',
      status: 'active',
    });
  }

  const defaults = [
    // Shifts
    { kind: 'shift', name: 'Morning', code: 'SH-M' },
    { kind: 'shift', name: 'Evening', code: 'SH-E' },
    { kind: 'shift', name: 'Night', code: 'SH-N' },
    // Departments
    { kind: 'department', name: 'Assembly', code: 'DEPT-ASM' },
    { kind: 'department', name: 'Quality Control', code: 'DEPT-QC' },
    { kind: 'department', name: 'Packaging', code: 'DEPT-PKG' },
    { kind: 'department', name: 'Production', code: 'DEPT-PROD' },
    { kind: 'department', name: 'Maintenance', code: 'DEPT-MAINT' },
    // Downtime Reasons
    { kind: 'downtimeReason', name: 'Power Failure', code: 'DT-PWR' },
    { kind: 'downtimeReason', name: 'Machine Breakdown', code: 'DT-BRK' },
    { kind: 'downtimeReason', name: 'Planned Maintenance', code: 'DT-PMAINT' },
    { kind: 'downtimeReason', name: 'Emergency Maintenance', code: 'DT-EMAINT' },
    { kind: 'downtimeReason', name: 'Material Delay', code: 'DT-MAT' },
    { kind: 'downtimeReason', name: 'Operator Break', code: 'DT-OPB' },
    { kind: 'downtimeReason', name: 'Quality Issue', code: 'DT-QI' },
    { kind: 'downtimeReason', name: 'Tool Change', code: 'DT-TOOL' },
    { kind: 'downtimeReason', name: 'Setup/Adjustment', code: 'DT-SETUP' },
    { kind: 'downtimeReason', name: 'Material Shortage', code: 'DT-MATSHORT' },
    { kind: 'downtimeReason', name: 'Other', code: 'DT-OTHER' },
    // Defect Types
    { kind: 'defectType', name: 'Critical', code: 'DEF-CRIT' },
    { kind: 'defectType', name: 'Major', code: 'DEF-MAJ' },
    { kind: 'defectType', name: 'Minor', code: 'DEF-MIN' },
    // Products
    { kind: 'product', name: 'Product A', code: 'PRD-A' },
    { kind: 'product', name: 'Product B', code: 'PRD-B' },
    { kind: 'product', name: 'Product C', code: 'PRD-C' },
    { kind: 'product', name: 'Product D', code: 'PRD-D' },
  ];

  const itemMap = new Map();

  for (const item of defaults) {
    const exists = await MasterItem.findOne({ kind: item.kind, name: item.name });
    if (!exists) {
      const created = await MasterItem.create(item);
      itemMap.set(`${item.kind}:${item.name}`, created._id);
    } else {
      itemMap.set(`${item.kind}:${item.name}`, exists._id);
    }
  }

  const deptAssembly = itemMap.get('department:Assembly');
  const deptQC = itemMap.get('department:Quality Control');
  const deptPackaging = itemMap.get('department:Packaging');
  const deptProduction = itemMap.get('department:Production');
  const deptMaintenance = itemMap.get('department:Maintenance');

  const hierarchicalDefaults = [
    { kind: 'line', name: 'Line 1', code: 'L1', departmentId: deptAssembly },
    { kind: 'line', name: 'Line 2', code: 'L2', departmentId: deptAssembly },
    { kind: 'line', name: 'Line 3', code: 'L3', departmentId: deptProduction },
    { kind: 'line', name: 'Line 4', code: 'L4', departmentId: deptPackaging },
    { kind: 'line', name: 'Line QC-1', code: 'LQC1', departmentId: deptQC },
    { kind: 'machine', name: 'Machine 1A', code: 'M1A', lineId: null, departmentId: deptAssembly },
    { kind: 'machine', name: 'Machine 1B', code: 'M1B', lineId: null, departmentId: deptAssembly },
    { kind: 'machine', name: 'Machine 2A', code: 'M2A', lineId: null, departmentId: deptAssembly },
    { kind: 'machine', name: 'Machine 3A', code: 'M3A', lineId: null, departmentId: deptProduction },
    { kind: 'machine', name: 'Machine 4A', code: 'M4A', lineId: null, departmentId: deptPackaging },
    { kind: 'process', name: 'Assembly Process A', code: 'PROC-A', machineId: null },
    { kind: 'process', name: 'Assembly Process B', code: 'PROC-B', machineId: null },
    { kind: 'process', name: 'Assembly Process C', code: 'PROC-C', machineId: null },
    { kind: 'process', name: 'Quality Check', code: 'PROC-QC', machineId: null },
    { kind: 'process', name: 'Packaging Process', code: 'PROC-PKG', machineId: null },
    { kind: 'operator', name: 'Operator 1', code: 'OP-1', departmentId: deptAssembly },
    { kind: 'operator', name: 'Operator 2', code: 'OP-2', departmentId: deptAssembly },
    { kind: 'operator', name: 'Operator 3', code: 'OP-3', departmentId: deptProduction },
    { kind: 'operator', name: 'Operator 4', code: 'OP-4', departmentId: deptQC },
    { kind: 'operator', name: 'Operator 5', code: 'OP-5', departmentId: deptPackaging },
    { kind: 'operator', name: 'Operator 6', code: 'OP-6', departmentId: deptQC },
  ];

  for (const item of hierarchicalDefaults) {
    const exists = await MasterItem.findOne({ kind: item.kind, name: item.name });
    if (!exists) {
      const createPayload = { ...item };
      delete createPayload.lineId;
      delete createPayload.machineId;
      if (item.departmentId) createPayload.departmentId = item.departmentId;
      if (item.lineId) createPayload.lineId = item.lineId;
      if (item.machineId) createPayload.machineId = item.machineId;
      await MasterItem.create(createPayload);
    }
  }

  // Seed production entries
  const existingEntries = await ProductionEntry.findOne();
  if (!existingEntries) {
    const admin = await User.findOne({ username: ADMIN_USERNAME.toLowerCase() });
    const operator = await User.findOne({ username: 'operator' });
    const adminId = admin?._id;
    const operatorId = operator?._id;

    if (adminId || operatorId) {
      const userId = adminId || operatorId;
      const today = nowDateString();
      const yesterday = previousDateString();
      const dayBeforeYesterday = new Date(new Date(yesterday).setDate(new Date(yesterday).getDate() - 1)).toISOString().slice(0, 10);

      const shiftMorning = itemMap.get('shift:Morning');
      const shiftEvening = itemMap.get('shift:Evening');
      const shiftNight = itemMap.get('shift:Night');
      const deptAssembly = itemMap.get('department:Assembly');
      const deptProduction = itemMap.get('department:Production');
      const deptPackaging = itemMap.get('department:Packaging');

      const line1 = await MasterItem.findOne({ kind: 'line', name: 'Line 1' });
      const line2 = await MasterItem.findOne({ kind: 'line', name: 'Line 2' });
      const line3 = await MasterItem.findOne({ kind: 'line', name: 'Line 3' });
      const line4 = await MasterItem.findOne({ kind: 'line', name: 'Line 4' });
      const machine1A = await MasterItem.findOne({ kind: 'machine', name: 'Machine 1A' });
      const machine1B = await MasterItem.findOne({ kind: 'machine', name: 'Machine 1B' });
      const machine2A = await MasterItem.findOne({ kind: 'machine', name: 'Machine 2A' });
      const machine3A = await MasterItem.findOne({ kind: 'machine', name: 'Machine 3A' });
      const machine4A = await MasterItem.findOne({ kind: 'machine', name: 'Machine 4A' });
      const processA = await MasterItem.findOne({ kind: 'process', name: 'Assembly Process A' });
      const processB = await MasterItem.findOne({ kind: 'process', name: 'Assembly Process B' });
      const processQC = await MasterItem.findOne({ kind: 'process', name: 'Quality Check' });
      const processPKG = await MasterItem.findOne({ kind: 'process', name: 'Packaging Process' });

      const [op1, op2, op3, op4, op5, op6] = await Promise.all([
        MasterItem.findOne({ kind: 'operator', name: 'Operator 1' }),
        MasterItem.findOne({ kind: 'operator', name: 'Operator 2' }),
        MasterItem.findOne({ kind: 'operator', name: 'Operator 3' }),
        MasterItem.findOne({ kind: 'operator', name: 'Operator 4' }),
        MasterItem.findOne({ kind: 'operator', name: 'Operator 5' }),
        MasterItem.findOne({ kind: 'operator', name: 'Operator 6' }),
      ]);

      const productA = itemMap.get('product:Product A');
      const productB = itemMap.get('product:Product B');
      const productC = itemMap.get('product:Product C');

      const sampleEntries = [
        { date: dayBeforeYesterday, shiftId: shiftMorning, departmentId: deptAssembly, lineId: line1?._id, machineId: machine1A?._id, processId: processA?._id, operatorId: op1?._id, productId: productA, plannedQty: 520, hourlyInputs: [45, 47, 46, 48, 49, 47, 48, 46, 0, 0, 0, 0], rejectQty: 12, reworkQty: 6, downtimeMinutes: 30, downtimeReasonId: itemMap.get('downtimeReason:Tool Change'), remarks: 'Machine calibration done. Production optimal.', status: 'locked', createdBy: userId, updatedBy: userId },
        { date: dayBeforeYesterday, shiftId: shiftEvening, departmentId: deptAssembly, lineId: line1?._id, machineId: machine1A?._id, processId: processA?._id, operatorId: op1?._id, productId: productA, plannedQty: 510, hourlyInputs: [46, 48, 47, 49, 50, 48, 49, 0, 0, 0, 0, 0], rejectQty: 14, reworkQty: 7, downtimeMinutes: 60, downtimeReasonId: itemMap.get('downtimeReason:Machine Breakdown'), remarks: 'Minor breakdown fixed by maintenance team.', status: 'locked', createdBy: userId, updatedBy: userId },
        { date: yesterday, shiftId: shiftMorning, departmentId: deptAssembly, lineId: line1?._id, machineId: machine1A?._id, processId: processA?._id, operatorId: op1?._id, productId: productA, plannedQty: 530, hourlyInputs: [46, 48, 47, 50, 49, 48, 49, 47, 0, 0, 0, 0], rejectQty: 13, reworkQty: 6, downtimeMinutes: 25, downtimeReasonId: null, remarks: 'Excellent morning shift performance.', status: 'locked', createdBy: userId, updatedBy: userId },
        { date: yesterday, shiftId: shiftEvening, departmentId: deptAssembly, lineId: line1?._id, machineId: machine1B?._id, processId: processA?._id, operatorId: op2?._id, productId: productA, plannedQty: 520, hourlyInputs: [47, 49, 48, 50, 51, 49, 50, 0, 0, 0, 0, 0], rejectQty: 15, reworkQty: 7, downtimeMinutes: 20, downtimeReasonId: null, remarks: 'Evening shift peak performance.', status: 'locked', createdBy: userId, updatedBy: userId },
        { date: today, shiftId: shiftMorning, departmentId: deptAssembly, lineId: line1?._id, machineId: machine1A?._id, processId: processA?._id, operatorId: op1?._id, productId: productA, plannedQty: 520, hourlyInputs: [46, 48, 47, 49, 0, 0, 0, 0, 0, 0, 0, 0], rejectQty: 10, reworkQty: 5, downtimeMinutes: 15, downtimeReasonId: null, remarks: 'Morning production ongoing. Target on track.', status: 'submitted', createdBy: userId, updatedBy: userId },
      ];

      for (const entry of sampleEntries) {
        const exists = await ProductionEntry.findOne({
          date: entry.date,
          lineId: entry.lineId,
          machineId: entry.machineId,
          shiftId: entry.shiftId,
          operatorId: entry.operatorId,
        });
        if (!exists) {
          const metrics = calculateMetrics(entry);
          await ProductionEntry.create({
            ...entry,
            ...metrics,
            editedCells: [],
            editLogs: [],
          });
        }
      }
    }
  }
};
