import cors from 'cors';
import { FRONTEND_URL, IS_PRODUCTION, ALLOWED_ORIGINS } from '../config/env.js';

const DEPLOYED_FRONTEND_ORIGINS = new Set([
  'https://line-ops-d12k.vercel.app',
]);

export const corsOptions = cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    
    if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
      return callback(null, true);
    }
    
    if (ALLOWED_ORIGINS.includes(origin) || DEPLOYED_FRONTEND_ORIGINS.has(origin)) {
      return callback(null, true);
    }
    
    if (IS_PRODUCTION) {
      callback(new Error('Not allowed by CORS'));
    } else {
      callback(null, true);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
});
