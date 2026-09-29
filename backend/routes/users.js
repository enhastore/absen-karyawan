const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { dbHelper } = require('../config/database');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

// GET /api/users
router.get('/', authenticateToken, requireAdmin, (req, res) => {
  try {
    const { department, role, status, search, page = 1, limit = 100 } = req.query;
    let conditions = ['1=1'];
    const params = [];

    if (department) { conditions.push('u.department_id = ?'); params.push(department); }
    if (role) { conditions.push('u.role = ?'); params.push(role); }
    if (status !== undefined && status !== '') {
      conditions.push('u.is_active = ?');
      params.push(status === 'active' ? 1 : 0);
    }
    if (search) {
      conditions.push('(u.name LIKE ? OR u.email LIKE ? OR u.employee_id LIKE ?)');
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    const where = conditions.join(' AND ');
    const total = dbHelper.prepare(`SELECT COUNT(*) as total FROM users u WHERE ${where}`).get(...params).total;
    const offset = (page - 1) * limit;
    const users = dbHelper.prepare(`
      SELECT u.id, u.employee_id, u.name, u.email, u.role, u.position, u.phone,
             u.avatar, u.is_active, u.created_at, u.department_id, d.name as department_name,
             u.telegram_chat_id, u.telegram_username,
             CASE WHEN u.is_active = 1 THEN 'active' ELSE 'inactive' END as status
      FROM users u LEFT JOIN departments d ON u.department_id = d.id
      WHERE ${where} ORDER BY u.id ASC LIMIT ? OFFSET ?
    `).all(...params, parseInt(limit), parseInt(offset));

    res.json({ users, pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / limit) } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Terjadi kesalahan server.' });
  }
});

// GET /api/users/:id
router.get('/:id', authenticateToken, (req, res) => {
  try {
    const user = dbHelper.prepare(`
      SELECT u.*, d.name as department_name,
             CASE WHEN u.is_active = 1 THEN 'active' ELSE 'inactive' END as status
      FROM users u
      LEFT JOIN departments d ON u.department_id = d.id WHERE u.id = ?
    `).get(req.params.id);
    if (!user) return res.status(404).json({ error: 'Karyawan tidak ditemukan.' });
    delete user.password_hash;
    res.json({ user });
  } catch (err) {
    res.status(500).json({ error: 'Terjadi kesalahan server.' });
  }
});

// POST /api/users
router.post('/', authenticateToken, requireAdmin, (req, res) => {
  try {
    const { employee_id, name, email, password, role, department_id, position, phone } = req.body;
    if (!employee_id || !name || !email || !password) {
      return res.status(400).json({ error: 'ID Karyawan, nama, email, dan kata sandi wajib diisi.' });
    }
    const existing = dbHelper.prepare('SELECT id FROM users WHERE email = ? OR employee_id = ?').get(email, employee_id);
    if (existing) return res.status(400).json({ error: 'Email atau ID Karyawan sudah terdaftar.' });

    const password_hash = bcrypt.hashSync(password, 10);
    const result = dbHelper.prepare(`
      INSERT INTO users (employee_id, name, email, password_hash, role, department_id, position, phone, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
    `).run(employee_id, name, email, password_hash, role || 'employee', department_id || null, position || null, phone || null);

    const insertedId = (result && result.lastInsertRowid) ? result.lastInsertRowid : dbHelper.prepare('SELECT id FROM users WHERE email = ?').get(email)?.id;
    const user = dbHelper.prepare('SELECT * FROM users WHERE id = ?').get(insertedId);
    if (user && user.password_hash) delete user.password_hash;
    res.status(201).json({ message: 'Karyawan berhasil ditambahkan.', user: user || { id: insertedId, name, email, employee_id } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Terjadi kesalahan server.' });
  }
});

// PUT /api/users/:id
router.put('/:id', authenticateToken, requireAdmin, (req, res) => {
  try {
    const { employee_id, name, email, role, department_id, position, phone, is_active, status, password } = req.body;
    const userId = req.params.id;
    const user = dbHelper.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!user) return res.status(404).json({ error: 'Karyawan tidak ditemukan.' });

    let activeVal = user.is_active;
    if (is_active !== undefined) activeVal = is_active ? 1 : 0;
    else if (status !== undefined) activeVal = status === 'active' ? 1 : 0;

    const u = {
      employee_id: employee_id || user.employee_id,
      name: name || user.name,
      email: email || user.email,
      role: role || user.role,
      department_id: department_id !== undefined ? (department_id || null) : user.department_id,
      position: position !== undefined ? position : user.position,
      phone: phone !== undefined ? phone : user.phone,
      is_active: activeVal,
    };

    if (password && password.trim().length > 0) {
      const hash = bcrypt.hashSync(password, 10);
      dbHelper.prepare(`UPDATE users SET employee_id=?, name=?, email=?, role=?, department_id=?, position=?, phone=?, is_active=?, password_hash=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`)
        .run(u.employee_id, u.name, u.email, u.role, u.department_id, u.position, u.phone, u.is_active, hash, userId);
    } else {
      dbHelper.prepare(`UPDATE users SET employee_id=?, name=?, email=?, role=?, department_id=?, position=?, phone=?, is_active=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`)
        .run(u.employee_id, u.name, u.email, u.role, u.department_id, u.position, u.phone, u.is_active, userId);
    }

    const updated = dbHelper.prepare('SELECT u.*, d.name as department_name FROM users u LEFT JOIN departments d ON u.department_id = d.id WHERE u.id = ?').get(userId);
    delete updated.password_hash;
    res.json({ message: 'Data karyawan berhasil diupdate.', user: updated });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Terjadi kesalahan server.' });
  }
});

// DELETE /api/users/:id - Permanent delete
router.delete('/:id', authenticateToken, requireAdmin, (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    if (userId === req.user.id) {
      return res.status(400).json({ error: 'Tidak dapat menghapus akun admin yang sedang Anda gunakan.' });
    }

    const user = dbHelper.prepare('SELECT id, name FROM users WHERE id = ?').get(userId);
    if (!user) return res.status(404).json({ error: 'Karyawan tidak ditemukan.' });

    // Remove child / related records
    try { dbHelper.prepare('DELETE FROM attendance WHERE user_id = ?').run(userId); } catch (e) {}
    try { dbHelper.prepare('DELETE FROM tasks WHERE assigned_to = ?').run(userId); } catch (e) {}
    try { dbHelper.prepare('DELETE FROM leaves WHERE user_id = ?').run(userId); } catch (e) {}
    try { dbHelper.prepare('DELETE FROM notifications WHERE user_id = ?').run(userId); } catch (e) {}

    // Delete user record
    dbHelper.prepare('DELETE FROM users WHERE id = ?').run(userId);

    res.json({ message: `Karyawan "${user.name}" berhasil dihapus.` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal menghapus karyawan dari database.' });
  }
});

module.exports = router;
