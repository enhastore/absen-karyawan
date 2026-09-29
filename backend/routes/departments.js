const express = require('express');
const router = express.Router();
const { dbHelper } = require('../config/database');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

router.get('/', authenticateToken, (req, res) => {
  try {
    const departments = dbHelper.prepare(`
      SELECT d.*, COUNT(u.id) as employee_count FROM departments d
      LEFT JOIN users u ON d.id = u.department_id AND u.is_active = 1
      GROUP BY d.id ORDER BY d.name
    `).all();
    res.json({ departments });
  } catch (err) { res.status(500).json({ error: 'Terjadi kesalahan server.' }); }
});

router.post('/', authenticateToken, requireAdmin, (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name) return res.status(400).json({ error: 'Nama departemen wajib diisi.' });
    const result = dbHelper.prepare('INSERT INTO departments (name, description) VALUES (?, ?)').run(name, description || null);
    const dept = dbHelper.prepare('SELECT * FROM departments WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ message: 'Departemen berhasil ditambahkan.', department: dept });
  } catch (err) {
    if (err.message && err.message.includes('UNIQUE')) return res.status(400).json({ error: 'Nama departemen sudah ada.' });
    res.status(500).json({ error: 'Terjadi kesalahan server.' });
  }
});

router.put('/:id', authenticateToken, requireAdmin, (req, res) => {
  try {
    const { name, description } = req.body;
    dbHelper.prepare('UPDATE departments SET name = ?, description = ? WHERE id = ?').run(name, description, req.params.id);
    const dept = dbHelper.prepare('SELECT * FROM departments WHERE id = ?').get(req.params.id);
    res.json({ message: 'Departemen berhasil diupdate.', department: dept });
  } catch (err) { res.status(500).json({ error: 'Terjadi kesalahan server.' }); }
});

router.delete('/:id', authenticateToken, requireAdmin, (req, res) => {
  try {
    const hasUsers = dbHelper.prepare('SELECT COUNT(*) as count FROM users WHERE department_id = ? AND is_active = 1').get(req.params.id);
    if (hasUsers.count > 0) return res.status(400).json({ error: 'Tidak bisa menghapus departemen yang masih memiliki karyawan aktif.' });
    dbHelper.prepare('DELETE FROM departments WHERE id = ?').run(req.params.id);
    res.json({ message: 'Departemen berhasil dihapus.' });
  } catch (err) { res.status(500).json({ error: 'Terjadi kesalahan server.' }); }
});

module.exports = router;
