const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { dbHelper, saveDatabaseAsync } = require('../config/database');
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
             u.salary_system, u.rate_per_account, u.base_salary, u.daily_target,
             u.target_bonus, u.payroll_period, u.period_start_day, u.pay_date,
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
    const {
      employee_id, name, email, password, role, department_id, position, phone,
      salary_system = 'per_account',
      rate_per_account = 500,
      base_salary = 0,
      daily_target = 0,
      target_bonus = 0,
      payroll_period = 'bulanan',
      period_start_day = 1,
      pay_date = '25'
    } = req.body;

    if (!employee_id || !name || !email || !password) {
      return res.status(400).json({ error: 'ID Karyawan, nama, email, dan kata sandi wajib diisi.' });
    }
    const existing = dbHelper.prepare('SELECT id FROM users WHERE email = ? OR employee_id = ?').get(email, employee_id);
    if (existing) return res.status(400).json({ error: 'Email atau ID Karyawan sudah terdaftar.' });

    const password_hash = bcrypt.hashSync(password, 10);
    const result = dbHelper.prepare(`
      INSERT INTO users (
        employee_id, name, email, password_hash, role, department_id, position, phone,
        salary_system, rate_per_account, base_salary, daily_target, target_bonus,
        payroll_period, period_start_day, pay_date, is_active
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `).run(
      employee_id, name, email, password_hash, role || 'employee', department_id || null, position || null, phone || null,
      salary_system, parseInt(rate_per_account) || 500, parseInt(base_salary) || 0,
      parseInt(daily_target) || 0, parseInt(target_bonus) || 0,
      payroll_period || 'bulanan', parseInt(period_start_day) || 1, String(pay_date || '25')
    );

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
    const {
      employee_id, name, email, role, department_id, position, phone, is_active, status, password,
      salary_system, rate_per_account, base_salary, daily_target, target_bonus,
      payroll_period, period_start_day, pay_date
    } = req.body;
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
      salary_system: salary_system !== undefined ? salary_system : (user.salary_system || 'per_account'),
      rate_per_account: rate_per_account !== undefined ? parseInt(rate_per_account) : (user.rate_per_account || 500),
      base_salary: base_salary !== undefined ? parseInt(base_salary) : (user.base_salary || 0),
      daily_target: daily_target !== undefined ? parseInt(daily_target) : (user.daily_target || 0),
      target_bonus: target_bonus !== undefined ? parseInt(target_bonus) : (user.target_bonus || 0),
      payroll_period: payroll_period !== undefined ? payroll_period : (user.payroll_period || 'bulanan'),
      period_start_day: period_start_day !== undefined ? parseInt(period_start_day) : (user.period_start_day || 1),
      pay_date: pay_date !== undefined ? String(pay_date) : (user.pay_date || '25'),
      is_active: activeVal,
    };

    if (password && password.trim().length > 0) {
      const hash = bcrypt.hashSync(password, 10);
      dbHelper.prepare(`
        UPDATE users SET
          employee_id=?, name=?, email=?, role=?, department_id=?, position=?, phone=?,
          salary_system=?, rate_per_account=?, base_salary=?, daily_target=?, target_bonus=?,
          payroll_period=?, period_start_day=?, pay_date=?,
          is_active=?, password_hash=?, updated_at=CURRENT_TIMESTAMP
        WHERE id=?
      `).run(
        u.employee_id, u.name, u.email, u.role, u.department_id, u.position, u.phone,
        u.salary_system, u.rate_per_account, u.base_salary, u.daily_target, u.target_bonus,
        u.payroll_period, u.period_start_day, u.pay_date,
        u.is_active, hash, userId
      );
    } else {
      dbHelper.prepare(`
        UPDATE users SET
          employee_id=?, name=?, email=?, role=?, department_id=?, position=?, phone=?,
          salary_system=?, rate_per_account=?, base_salary=?, daily_target=?, target_bonus=?,
          payroll_period=?, period_start_day=?, pay_date=?,
          is_active=?, updated_at=CURRENT_TIMESTAMP
        WHERE id=?
      `).run(
        u.employee_id, u.name, u.email, u.role, u.department_id, u.position, u.phone,
        u.salary_system, u.rate_per_account, u.base_salary, u.daily_target, u.target_bonus,
        u.payroll_period, u.period_start_day, u.pay_date,
        u.is_active, userId
      );
    }

    const updated = dbHelper.prepare('SELECT u.*, d.name as department_name FROM users u LEFT JOIN departments d ON u.department_id = d.id WHERE u.id = ?').get(userId);
    delete updated.password_hash;
    res.json({ message: 'Data karyawan berhasil diupdate.', user: updated });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Terjadi kesalahan server.' });
  }
});

// GET /api/users/:id/activities (Catatan khusus & log aktivitas untuk karyawan terpilih atau diri sendiri)
router.get('/:id/activities', authenticateToken, (req, res) => {
  try {
    const userId = (req.params.id === 'me') ? req.user.id : parseInt(req.params.id, 10);
    if (req.user.role !== 'admin' && req.user.id !== userId) {
      return res.status(403).json({ error: 'Akses ditolak.' });
    }
    const employee = dbHelper.prepare(`
      SELECT u.id, u.employee_id, u.name, u.email, u.phone, u.avatar, u.position,
             u.salary_system, u.rate_per_account, u.base_salary, u.daily_target, u.target_bonus,
             u.payroll_period, u.is_active, d.name as department_name
      FROM users u
      LEFT JOIN departments d ON u.department_id = d.id
      WHERE u.id = ?
    `).get(userId);

    if (!employee) return res.status(404).json({ error: 'Karyawan tidak ditemukan.' });

    // 1. Ambil seluruh riwayat laporan kerja / absensi karyawan INI SAJA ("muncul A doang")
    const attendances = dbHelper.prepare(`
      SELECT id, date, clock_in, clock_out, status, work_hours, overtime_hours,
             accounts_created, rate_per_account, daily_earnings, work_report, notes,
             payment_status, approval_status, created_at
      FROM attendance
      WHERE user_id = ?
      ORDER BY date DESC
    `).all(userId);

    // Hitung ringkasan performa karyawan ini
    let totalAccounts = 0;
    let totalEarnings = 0;
    let totalWorkHours = 0;
    let daysPresent = 0;

    attendances.forEach(a => {
      const acc = a.accounts_created || 0;
      const rate = a.rate_per_account || employee.rate_per_account || 500;
      const earn = (a.daily_earnings !== undefined && a.daily_earnings !== null && a.daily_earnings > 0)
        ? a.daily_earnings
        : (acc * rate);

      totalAccounts += acc;
      totalEarnings += earn;
      totalWorkHours += (a.work_hours || 0);
      if (a.status === 'present' || a.status === 'late' || a.clock_in) daysPresent++;
    });

    // 2. Ambil catatan khusus admin untuk karyawan ini
    let adminNotes = [];
    try {
      adminNotes = dbHelper.prepare(`
        SELECT id, note, category, author_name, created_at
        FROM employee_notes
        WHERE user_id = ?
        ORDER BY created_at DESC
      `).all(userId);
    } catch(e) {}

    // 3. Ambil cuti / izin karyawan ini
    let leaves = [];
    try {
      leaves = dbHelper.prepare(`
        SELECT id, start_date, end_date, type, reason, status
        FROM leave_requests
        WHERE user_id = ?
        ORDER BY start_date DESC
      `).all(userId);
    } catch(e) {}

    res.json({
      employee,
      stats: {
        total_days_present: daysPresent,
        total_accounts_created: totalAccounts,
        total_accumulated_wages: totalEarnings,
        total_work_hours: Math.round(totalWorkHours * 10) / 10,
        average_accounts_per_day: daysPresent > 0 ? Math.round((totalAccounts / daysPresent) * 10) / 10 : 0
      },
      work_reports: attendances,
      admin_notes: adminNotes,
      leaves: leaves
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Terjadi kesalahan saat memuat aktivitas karyawan.' });
  }
});

// POST /api/users/:id/notes (Tambah catatan khusus aktivitas oleh Admin)
router.post('/:id/notes', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const userId = parseInt(req.params.id, 10);
    const { note, category = 'aktivitas' } = req.body;
    if (!note || !note.trim()) {
      return res.status(400).json({ error: 'Catatan tidak boleh kosong.' });
    }

    const employee = dbHelper.prepare('SELECT id, name FROM users WHERE id = ?').get(userId);
    if (!employee) return res.status(404).json({ error: 'Karyawan tidak ditemukan.' });

    const authorName = req.user.name || 'Admin';
    const result = dbHelper.prepare(`
      INSERT INTO employee_notes (user_id, author_id, author_name, note, category)
      VALUES (?, ?, ?, ?, ?)
    `).run(userId, req.user.id, authorName, note.trim(), category);

    if (typeof saveDatabaseAsync === 'function') {
      await saveDatabaseAsync();
    }

    const insertedId = (result && result.lastInsertRowid)
      ? result.lastInsertRowid
      : dbHelper.prepare('SELECT id FROM employee_notes WHERE user_id = ? ORDER BY id DESC LIMIT 1').get(userId)?.id;
    const inserted = dbHelper.prepare('SELECT * FROM employee_notes WHERE id = ?').get(insertedId);
    res.status(201).json({ message: 'Catatan khusus berhasil ditambahkan.', note: inserted });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal menyimpan catatan khusus.' });
  }
});

// DELETE /api/users/:id/notes/:noteId
router.delete('/:id/notes/:noteId', authenticateToken, requireAdmin, (req, res) => {
  try {
    const { id, noteId } = req.params;
    dbHelper.prepare('DELETE FROM employee_notes WHERE id = ? AND user_id = ?').run(noteId, id);
    res.json({ message: 'Catatan berhasil dihapus.' });
  } catch (err) {
    res.status(500).json({ error: 'Gagal menghapus catatan.' });
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
