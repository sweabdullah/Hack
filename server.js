const express = require('express');
const path = require('path');
require('dotenv').config();

// Import routes
const authRoutes = require('./routes/auth');
const dashboardRoutes = require('./routes/dashboard');
const reminderRoutes = require('./routes/reminders');

// Import cron job
const ReminderCron = require('./jobs/reminderCron');

// Initialize database
require('./config/database');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.use('/', authRoutes);
app.use('/', dashboardRoutes);
app.use('/', reminderRoutes);

// Root route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

// Start server
app.listen(PORT, () => {
  console.log('='.repeat(50));
  console.log(`🚀 Zid Retention Engine Server Running`);
  console.log(`📍 Port: ${PORT}`);
  console.log(`🌐 Dashboard: http://localhost:${PORT}`);
  console.log(`🔐 Install: http://localhost:${PORT}/install`);
  console.log('='.repeat(50));

  // Start reminder cron job (check every 5 minutes)
  const reminderCron = new ReminderCron(5);
  reminderCron.start();
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully...');
  process.exit(0);
});

