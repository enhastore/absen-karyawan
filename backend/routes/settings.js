const express = require('express');
const router = express.Router();
const { dbHelper } = require('../config/database');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

router.get('/', authenticateToken, (req, res) => {
  try {
    const settings = dbHelper.prepare('SELECT * FROM settings ORDER BY key').all();
    const settingsMap = {};
    settings.forEach(s => { settingsMap[s.key] = s.value; });
    res.json({ settings: settingsMap, raw: settings });
  } catch (err) {
    res.status(500).json({ error: 'Terjadi kesalahan server.' });
  }
});

router.put('/', authenticateToken, requireAdmin, (req, res) => {
  try {
    const updates = req.body;
    for (const [key, value] of Object.entries(updates)) {
      const existing = dbHelper.prepare('SELECT key FROM settings WHERE key = ?').get(key);
      if (existing) {
        dbHelper.prepare('UPDATE settings SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE key = ?').run(String(value), key);
      } else {
        dbHelper.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run(key, String(value));
      }
    }
    res.json({ message: 'Pengaturan toko & operasional berhasil disimpan.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Terjadi kesalahan server saat menyimpan pengaturan.' });
  }
});

router.get('/shifts', authenticateToken, (req, res) => {
  try {
    const shifts = dbHelper.prepare('SELECT * FROM shifts ORDER BY is_default DESC, name').all();
    res.json({ shifts });
  } catch (err) {
    res.status(500).json({ error: 'Terjadi kesalahan server.' });
  }
});

router.post('/shifts', authenticateToken, requireAdmin, (req, res) => {
  try {
    const { name, start_time, end_time, late_tolerance } = req.body;
    if (!name || !start_time || !end_time) return res.status(400).json({ error: 'Nama, jam mulai, dan jam selesai wajib diisi.' });
    const result = dbHelper.prepare('INSERT INTO shifts (name, start_time, end_time, late_tolerance) VALUES (?,?,?,?)').run(name, start_time, end_time, late_tolerance || 15);
    const shift = dbHelper.prepare('SELECT * FROM shifts WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ message: 'Shift berhasil ditambahkan.', shift });
  } catch (err) {
    res.status(500).json({ error: 'Terjadi kesalahan server.' });
  }
});

router.get('/notifications', authenticateToken, (req, res) => {
  try {
    const notifications = dbHelper.prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50').all(req.user.id);
    const unread = dbHelper.prepare('SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0').get(req.user.id);
    res.json({ notifications, unread_count: unread.count });
  } catch (err) {
    res.status(500).json({ error: 'Terjadi kesalahan server.' });
  }
});

router.put('/notifications/read', authenticateToken, (req, res) => {
  try {
    dbHelper.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0').run(req.user.id);
    res.json({ message: 'Semua notifikasi sudah dibaca.' });
  } catch (err) {
    res.status(500).json({ error: 'Terjadi kesalahan server.' });
  }
});

module.exports = router;
