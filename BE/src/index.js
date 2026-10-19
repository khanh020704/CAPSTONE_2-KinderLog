require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { getPool } = require('./database/db');
const { errorHandler } = require('./middleware/errorHandler');

// ── Route imports ────────────────────────────────────────────────────────────
const authRoutes   = require('./routes/auth.routes');
const adminRoutes  = require('./routes/admin.routes');
const parentRoutes = require('./routes/parent.routes');

const app  = express();
const PORT = process.env.PORT || 5000;

// ── Middleware ───────────────────────────────────────────────────────────────
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// ── Request logger (dev only) ────────────────────────────────────────────────
if (process.env.NODE_ENV !== 'production') {
  app.use((req, _res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
  });
}

// ── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/auth',   authRoutes);
app.use('/api/admin',  adminRoutes);
app.use('/api/parent', parentRoutes);

// Health check
app.get('/api/health', (_req, res) => res.json({ status: 'ok', ts: Date.now() }));

// 404
app.use((_req, res) => res.status(404).json({ error: 'Route not found.' }));

// Global error handler
app.use(errorHandler);

// ── Start server ─────────────────────────────────────────────────────────────
async function start() {
  try {
    await getPool(); // Test DB connection on startup
    app.listen(PORT, () => {
      console.log('');
      console.log('╔══════════════════════════════════════╗');
      console.log('║     KinderLog Backend  🎒             ║');
      console.log('╠══════════════════════════════════════╣');
      console.log(`║  API     : http://localhost:${PORT}     ║`);
      console.log(`║  ENV     : ${process.env.NODE_ENV || 'development'}              ║`);
      console.log('╚══════════════════════════════════════╝');
      console.log('');
    });
  } catch (err) {
    console.error('❌ Failed to start server:', err.message);
    process.exit(1);
  }
}

start();
