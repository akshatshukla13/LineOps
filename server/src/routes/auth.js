import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../config/env.js';
import { User } from '../models/index.js';
import { sanitizeUser } from '../utils/helpers.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

export const loginLimiter = (req, res, next) => {
  // Rate limiting will be applied at app level
  next();
};

router.post('/login', async (req, res) => {
  const { username, password } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }

  const user = await User.findOne({ username: String(username).toLowerCase().trim() });
  if (!user || user.status !== 'active') {
    return res.status(401).json({ error: 'Invalid credentials.' });
  }

  const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
  if (!isPasswordValid) {
    return res.status(401).json({ error: 'Invalid credentials.' });
  }

  const token = jwt.sign({ sub: String(user._id), role: user.role }, JWT_SECRET, { expiresIn: '12h' });
  return res.json({ token, user: sanitizeUser(user) });
});

router.get('/me', authMiddleware, async (req, res) => {
  return res.json({ user: sanitizeUser(req.user) });
});

export default router;
