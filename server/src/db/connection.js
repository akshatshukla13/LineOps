import mongoose from 'mongoose';
import { MONGODB_URI, MONGODB_DB_NAME } from '../config/env.js';

export const ensureDbConnection = async () => {
  if (!MONGODB_URI) {
    throw new Error('MONGODB_URI is required');
  }

  await mongoose.connect(MONGODB_URI, {
    dbName: MONGODB_DB_NAME,
    sanitizeFilter: true,
  });
};
