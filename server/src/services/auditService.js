import { AuditLog } from '../models/index.js';

export const recordAudit = async (actorId, action, entity, entityId, metadata = {}) => {
  await AuditLog.create({ actorId, action, entity, entityId: String(entityId), metadata });
};
