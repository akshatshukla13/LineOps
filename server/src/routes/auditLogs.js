import { Router } from 'express';
import { AuditLog } from '../models/index.js';
import { authMiddleware, requireRole } from '../middleware/auth.js';

const router = Router();

router.get('/', authMiddleware, requireRole('admin', 'supervisor'), async (req, res) => {
  const { entity = '', entityId = '' } = req.query;
  const query = {};
  if (entity) query.entity = String(entity).replace(/[^a-zA-Z0-9:_-]/g, '');
  if (entityId) query.entityId = String(entityId).replace(/[^a-zA-Z0-9]/g, '');

  const logs = await AuditLog.find(query).sort({ createdAt: -1 }).limit(500).lean();
  return res.json(logs);
});

export default router;
