import bcrypt from 'bcryptjs';
import { User, MasterItem } from '../models/index.js';
import { ADMIN_USERNAME, ADMIN_PASSWORD } from '../config/env.js';
import { syncProductionInventory } from './syncProductionInventory.js';

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
    { kind: 'shift', name: 'Morning', code: 'SH-M' },
    { kind: 'shift', name: 'Evening', code: 'SH-E' },
    { kind: 'shift', name: 'Night', code: 'SH-N' },
    { kind: 'defectType', name: 'Critical', code: 'DEF-CRIT' },
    { kind: 'defectType', name: 'Major', code: 'DEF-MAJ' },
    { kind: 'defectType', name: 'Minor', code: 'DEF-MIN' },
  ];

  for (const item of defaults) {
    const exists = await MasterItem.findOne({ kind: item.kind, name: item.name });
    if (!exists) {
      await MasterItem.create(item);
    }
  }

  const operatorDefaults = [
    { kind: 'operator', name: 'Operator 1', code: 'OP-1' },
    { kind: 'operator', name: 'Operator 2', code: 'OP-2' },
    { kind: 'operator', name: 'Operator 3', code: 'OP-3' },
    { kind: 'operator', name: 'Operator 4', code: 'OP-4' },
    { kind: 'operator', name: 'Operator 5', code: 'OP-5' },
    { kind: 'operator', name: 'Operator 6', code: 'OP-6' },
  ];

  for (const item of operatorDefaults) {
    const exists = await MasterItem.findOne({ kind: item.kind, name: item.name });
    if (!exists) {
      await MasterItem.create({ ...item, active: true });
    } else if (exists.departmentId) {
      exists.departmentId = null;
      await exists.save();
    }
  }

  await syncProductionInventory();
};
