const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { dbHelper } = require('../config/database');
const { authenticateToken, generateToken } = require('../middleware/auth');

// POST /api/auth/login
router.post('/login', (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email dan password harus diisi.' });
    }

    const user = dbHelper.prepare('SELECT * FROM users WHERE email = ? AND is_active = 1').get(email);
    if (!user) {
      return res.status(401).json({ error: 'Email atau password salah.' });
    }

    const isValid = bcrypt.compareSync(password, user.password_hash);
    if (!isValid) {
      return res.status(401).json({ error: 'Email atau password salah.' });
    }

    const token = generateToken(user);
    const dept = user.department_id
      ? dbHelper.prepare('SELECT name FROM departments WHERE id = ?').get(user.department_id)
      : null;

    res.json({
      message: 'Login berhasil!',
      token,
      user: {
        id: user.id,
        employee_id: user.employee_id,
        name: user.name,
        email: user.email,
        role: user.role,
        department: dept ? dept.name : null,
        position: user.position,
        avatar: user.avatar,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Terjadi kesalahan server.' });
  }
});

// GET /api/auth/me
router.get('/me', authenticateToken, (req, res) => {
  try {
    const user = dbHelper.prepare(`
      SELECT u.*, d.name as department_name 
      FROM users u LEFT JOIN departments d ON u.department_id = d.id WHERE u.id = ?
    `).get(req.user.id);
    if (!user) return res.status(404).json({ error: 'User tidak ditemukan.' });
    delete user.password_hash;
    res.json({ user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Terjadi kesalahan server.' });
  }
});

// PUT /api/auth/change-password
router.put('/change-password', authenticateToken, (req, res) => {
  try {
    const { current_password, new_password } = req.body;
    const user = dbHelper.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    if (!bcrypt.compareSync(current_password, user.password_hash)) {
      return res.status(400).json({ error: 'Password lama salah.' });
    }
    const hash = bcrypt.hashSync(new_password, 10);
    dbHelper.prepare('UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(hash, req.user.id);
    res.json({ message: 'Password berhasil diubah.' });
  } catch (err) {
    res.status(500).json({ error: 'Terjadi kesalahan server.' });
  }
});

// PUT /api/auth/profile
router.put('/profile', authenticateToken, (req, res) => {
  try {
    const { name, phone } = req.body;
    const user = dbHelper.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    if (!user) return res.status(404).json({ error: 'User tidak ditemukan.' });

    const newName = name && name.trim() ? name.trim() : user.name;
    const newPhone = phone !== undefined ? phone.trim() : user.phone;

    dbHelper.prepare('UPDATE users SET name = ?, phone = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(newName, newPhone, req.user.id);

    const updated = dbHelper.prepare(`
      SELECT u.*, d.name as department_name 
      FROM users u LEFT JOIN departments d ON u.department_id = d.id WHERE u.id = ?
    `).get(req.user.id);
    delete updated.password_hash;

    res.json({ message: 'Profil berhasil diperbarui.', user: updated });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Terjadi kesalahan server.' });
  }
});

module.exports = router;


