import mongoose from 'mongoose';
import { MONGODB_URI, MONGODB_DB_NAME } from '../config/env.js';

let connectionPromise;

export const ensureDbConnection = async () => {
  if (!MONGODB_URI) {
    throw new Error('MONGODB_URI is required');
  }

  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  if (mongoose.connection.readyState === 2 && connectionPromise) {
    return connectionPromise;
  }

  connectionPromise = mongoose.connect(MONGODB_URI, {
    dbName: MONGODB_DB_NAME,
    sanitizeFilter: true,
  }).catch((error) => {
    connectionPromise = undefined;
    throw error;
  });

  return connectionPromise;
};
