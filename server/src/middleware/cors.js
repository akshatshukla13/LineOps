import { FRONTEND_URL, IS_PRODUCTION, ALLOWED_ORIGINS } from '../config/env.js';

const DEPLOYED_FRONTEND_ORIGINS = new Set([
  'https://line-ops-d12k.vercel.app',
]);

const getAllowedOrigins = () => {
  const origins = new Set(ALLOWED_ORIGINS);

  if (FRONTEND_URL) {
    origins.add(FRONTEND_URL);
  }

  for (const origin of DEPLOYED_FRONTEND_ORIGINS) {
    origins.add(origin);
  }

  return origins;
};

export const corsOptions = (req, res, next) => {
  const origin = req.headers.origin;

  if (!origin) {
    return next();
  }

  const allowedOrigins = getAllowedOrigins();
  const isLocalOrigin = origin.includes('localhost') || origin.includes('127.0.0.1');
  const isAllowed = isLocalOrigin || allowedOrigins.has(origin);

  if (!isAllowed && IS_PRODUCTION) {
    return res.status(403).json({ error: 'Not allowed by CORS' });
  }

  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,PATCH,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');

  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }

  return next();
};
