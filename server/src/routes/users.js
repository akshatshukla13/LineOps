import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { User } from '../models/index.js';
import { sanitizeUser } from '../utils/helpers.js';
import { authMiddleware, requireRole } from '../middleware/auth.js';
import { recordAudit } from '../services/auditService.js';
import { ROLE_HIERARCHY, VALID_ROLES, VALID_STATUSES } from '../config/constants.js';
import { isValidObjectId } from '../utils/validators.js';

const router = Router();

router.get('/', authMiddleware, requireRole('admin'), async (req, res) => {
  const users = await User.find().sort({ createdAt: -1 }).lean();
  return res.json(users.map((u) => ({ ...sanitizeUser(u), id: u._id })));
});

router.post('/', authMiddleware, requireRole('admin'), async (req, res) => {
  const {
    fullName,
    employeeId,
    username,
    password,
    role = 'operator',
    assignedDepartment = null,
    assignedLines = [],
    status = 'active',
  } = req.body || {};

  if (!fullName || !employeeId || !username || !password) {
    return res.status(400).json({ error: 'fullName, employeeId, username and password are required.' });
  }

  if (!ROLE_HIERARCHY[role]) {
    return res.status(400).json({ error: 'Invalid role.' });
  }

  const existing = await User.findOne({ username: String(username).toLowerCase().trim() });
  if (existing) {
    return res.status(409).json({ error: 'Username already exists.' });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await User.create({
    fullName,
    employeeId,
    username,
    passwordHash,
    role,
    assignedDepartment,
    assignedLines,
    status,
  });

  await recordAudit(req.user._id, 'create', 'user', user._id, { role: user.role });
  return res.status(201).json({ user: sanitizeUser(user) });
});

router.put('/:id', authMiddleware, requireRole('admin'), async (req, res) => {
  const { id } = req.params;
  const { fullName, employeeId, role, assignedDepartment, assignedLines, status } = req.body || {};

  if (!isValidObjectId(id)) {
    return res.status(400).json({ error: 'Invalid user id.' });
  }

  const user = await User.findById(id);
  if (!user) {
    return res.status(404).json({ error: 'User not found.' });
  }

  if (fullName !== undefined) user.fullName = fullName;
  if (employeeId !== undefined) user.employeeId = employeeId;
  if (role !== undefined && ROLE_HIERARCHY[role]) user.role = role;
  if (assignedDepartment !== undefined) user.assignedDepartment = assignedDepartment;
  if (assignedLines !== undefined) user.assignedLines = assignedLines;
  if (status !== undefined && VALID_STATUSES.includes(status)) user.status = status;

  await user.save();
  await recordAudit(req.user._id, 'update', 'user', user._id, { role: user.role, status: user.status });
  return res.json({ user: sanitizeUser(user) });
});

router.post('/:id/reset-password', authMiddleware, requireRole('admin'), async (req, res) => {
  const { id } = req.params;
  const { password } = req.body || {};

  if (!isValidObjectId(id)) {
    return res.status(400).json({ error: 'Invalid user id.' });
  }
  if (!password || String(password).length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }

  const user = await User.findById(id);
  if (!user) {
    return res.status(404).json({ error: 'User not found.' });
  }

  user.passwordHash = await bcrypt.hash(password, 10);
  await user.save();
  await recordAudit(req.user._id, 'reset_password', 'user', user._id);
  return res.json({ ok: true });
});

export default router;
