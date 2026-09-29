require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { initDatabase } = require('./config/database');
const { seed } = require('./config/seed');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Serve static files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/admin', express.static(path.join(__dirname, '..', 'admin')));

// API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/attendance', require('./routes/attendance'));
app.use('/api/tasks', require('./routes/tasks'));
app.use('/api/departments', require('./routes/departments'));
app.use('/api/leaves', require('./routes/leaves'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/ai', require('./routes/ai'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Redirect root to admin
app.get('/', (req, res) => {
  res.redirect('/admin');
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server Error:', err);
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: 'Ukuran file terlalu besar. Maksimal 5MB.' });
  }
  res.status(500).json({ error: 'Terjadi kesalahan pada server.' });
});

// Initialize database and start server
async function start() {
  try {
    await initDatabase();
    console.log('✅ Database initialized');
    
    // Run seed if needed
    if (!process.env.VERCEL) {
      await seed();
    }

    // Initialize Telegram Bot & AI Service if configured (only in persistent server, not serverless)
    if (!process.env.VERCEL) {
      try {
        const aiTelegramService = require('./services/aiTelegramService');
        const s = aiTelegramService.getSettings();
        if (s.telegram_bot_token && (s.telegram_polling_active === 'true' || s.telegram_polling_active === '1')) {
          aiTelegramService.startPolling();
        }
      } catch (e) {
        console.warn('Telegram service startup note:', e.message);
      }
    }
    
    if (!process.env.VERCEL) {
      app.listen(PORT, () => {
        console.log(`
  ╔══════════════════════════════════════════════╗
  ║     🏢 SISTEM ABSENSI KARYAWAN              ║
  ║                                              ║
  ║     Server running on port ${PORT}              ║
  ║     Admin Panel: http://localhost:${PORT}/admin  ║
  ║     API Base:    http://localhost:${PORT}/api    ║
  ╚══════════════════════════════════════════════╝
        `);
      });
    }
  } catch (err) {
    console.error('Failed to start server:', err);
    if (!process.env.VERCEL) {
      process.exit(1);
    }
  }
}

// In Vercel serverless, ensure initDatabase is called when module is loaded
if (process.env.VERCEL) {
  initDatabase().catch(err => console.error('Vercel initDatabase error:', err));
} else {
  start();
}

module.exports = app;
