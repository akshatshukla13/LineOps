import express from 'express';
import { corsOptions } from './src/middleware/cors.js';
import { apiLimiter, loginLimiter } from './src/config/rateLimits.js';
import { PORT, IS_PRODUCTION, JWT_SECRET, ADMIN_PASSWORD } from './src/config/env.js';
import { ensureDbConnection } from './src/db/connection.js';
import { seedInitialData } from './src/db/seed.js';

// Import routes
import authRoutes from './src/routes/auth.js';
import usersRoutes from './src/routes/users.js';
import masterRoutes from './src/routes/master.js';
import entriesRoutes from './src/routes/entries.js';
import reportsRoutes from './src/routes/reports.js';
import auditLogsRoutes from './src/routes/auditLogs.js';
import notificationsRoutes from './src/routes/notifications.js';

const app = express();

// Validation checks for production
if (IS_PRODUCTION && !JWT_SECRET) {
  throw new Error('JWT_SECRET is required in production.');
}

if (IS_PRODUCTION && !ADMIN_PASSWORD) {
  throw new Error('ADMIN_PASSWORD is required in production.');
}

// Middleware
app.use(corsOptions);
app.use(express.json({ limit: '2mb' }));
app.use('/api', apiLimiter);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// API Routes
app.post('/api/auth/login', loginLimiter, (req, res, next) => {
  authRoutes(req, res, next);
});

app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/master', masterRoutes);
app.use('/api/entries', entriesRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/audit-logs', auditLogsRoutes);
app.use('/api/notifications', notificationsRoutes);

// Error handling middleware
app.use((error, req, res, next) => {
  console.error(error);
  res.status(500).json({ error: 'Internal server error.' });
});

const start = async () => {
  await ensureDbConnection();
  await seedInitialData();

  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
};

start().catch((error) => {
  console.error('Failed to start server', error);
  process.exit(1);
});
