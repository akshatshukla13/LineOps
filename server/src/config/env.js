import 'dotenv/config';

export const PORT = Number(process.env.PORT || 5000);
export const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
export const MONGODB_URI = process.env.MONGODB_URI;
export const DB_MODE = (process.env.DB_MODE || 'old').toLowerCase();
export const MONGODB_DB_NAME_OLD = process.env.MONGODB_DB_NAME_OLD || process.env.MONGODB_DB_NAME || 'lineops';
export const MONGODB_DB_NAME_NEW = process.env.MONGODB_DB_NAME_NEW || 'lineops_new';
export const MONGODB_DB_NAME =
  DB_MODE === 'new'
    ? MONGODB_DB_NAME_NEW
    : DB_MODE === 'old'
      ? MONGODB_DB_NAME_OLD
      : process.env.MONGODB_DB_NAME || MONGODB_DB_NAME_OLD;
export const IS_PRODUCTION = process.env.NODE_ENV === 'production';
export const JWT_SECRET = process.env.JWT_SECRET || (IS_PRODUCTION ? '' : 'lineops-dev-secret');
export const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
export const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || (IS_PRODUCTION ? 'Admin@123' : 'Admin@123');
export const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS?.split(',') || [];
