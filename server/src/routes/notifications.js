import { Router } from 'express';
import { User, ProductionEntry } from '../models/index.js';
import { authMiddleware, requireRole } from '../middleware/auth.js';
import { nowDateString } from '../utils/helpers.js';

const router = Router();

router.get('/missed-entries', authMiddleware, requireRole('admin', 'supervisor'), async (req, res) => {
  const today = nowDateString();

  const [operators, entries] = await Promise.all([
    User.find({ role: 'operator', status: 'active' }).lean(),
    ProductionEntry.find({ date: today }).lean(),
  ]);

  const enteredByOperator = new Set(entries.map((entry) => String(entry.createdBy)));
  const missed = operators.filter((operator) => !enteredByOperator.has(String(operator._id)));

  return res.json({
    date: today,
    missedCount: missed.length,
    missed: missed.map((u) => ({ id: u._id, fullName: u.fullName, employeeId: u.employeeId })),
  });
});

export default router;
