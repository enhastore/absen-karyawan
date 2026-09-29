const express = require('express');
const router = express.Router();
const { dbHelper } = require('../config/database');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const upload = require('../middleware/upload');

// POST /api/attendance/clock-in (Instant, GPS removed)
router.post('/clock-in', authenticateToken, upload.single('photo'), (req, res) => {
  try {
    const userId = req.user.id;
    const today = new Date().toISOString().split('T')[0];
    const now = new Date();
    const currentTime = now.toTimeString().split(' ')[0].substring(0, 5);

    const existing = dbHelper.prepare('SELECT * FROM attendance WHERE user_id = ? AND date = ?').get(userId, today);
    if (existing && existing.clock_in) {
      return res.status(400).json({ error: 'Anda sudah mencatat kehadiran masuk hari ini.' });
    }

    const { notes } = req.body;
    const photo = req.file ? `/uploads/attendance/${req.file.filename}` : null;

    const workStart = dbHelper.prepare("SELECT value FROM settings WHERE key = 'work_start'").get();
    const tolerance = dbHelper.prepare("SELECT value FROM settings WHERE key = 'late_tolerance'").get();
    const startTime = workStart ? workStart.value : '08:00';
    const toleranceMin = tolerance ? parseInt(tolerance.value) : 15;

    let status = 'present';
    const [startH, startM] = startTime.split(':').map(Number);
    const [curH, curM] = currentTime.split(':').map(Number);
    if (curH * 60 + curM > startH * 60 + startM + toleranceMin) status = 'late';

    if (existing) {
      dbHelper.prepare('UPDATE attendance SET clock_in=?, clock_in_photo=?, status=?, notes=? WHERE id=?')
        .run(currentTime, photo, status, notes || null, existing.id);
    } else {
      dbHelper.prepare('INSERT INTO attendance (user_id, date, clock_in, clock_in_photo, status, notes) VALUES (?,?,?,?,?,?)')
        .run(userId, today, currentTime, photo, status, notes || null);
    }

    res.json({
      message: `Presensi masuk berhasil! Status: ${status === 'late' ? 'Terlambat' : 'Tepat Waktu'} (${currentTime})`,
      data: { time: currentTime, status, date: today },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Terjadi kesalahan server saat mencatat kehadiran.' });
  }
});

// POST /api/attendance/clock-out (Instant, GPS removed)
router.post('/clock-out', authenticateToken, upload.single('photo'), (req, res) => {
  try {
    const userId = req.user.id;
    const today = new Date().toISOString().split('T')[0];
    const currentTime = new Date().toTimeString().split(' ')[0].substring(0, 5);

    const existing = dbHelper.prepare('SELECT * FROM attendance WHERE user_id = ? AND date = ?').get(userId, today);
    if (!existing || !existing.clock_in) return res.status(400).json({ error: 'Anda belum mencatat jam masuk hari ini.' });
    if (existing.clock_out) return res.status(400).json({ error: 'Anda sudah mencatat jam pulang hari ini.' });

    const { notes } = req.body;
    const photo = req.file ? `/uploads/attendance/${req.file.filename}` : null;

    const [inH, inM] = existing.clock_in.split(':').map(Number);
    const [outH, outM] = currentTime.split(':').map(Number);
    let diffMinutes = (outH * 60 + outM) - (inH * 60 + inM);
    if (diffMinutes < 0) diffMinutes += 24 * 60;
    const workHours = Math.max(0, Math.round((diffMinutes / 60) * 100) / 100);

    const workEnd = dbHelper.prepare("SELECT value FROM settings WHERE key = 'work_end'").get();
    const endTime = workEnd ? workEnd.value : '17:00';
    const [endH, endM] = endTime.split(':').map(Number);
    const overtimeHours = Math.round(Math.max(0, (outH * 60 + outM) - (endH * 60 + endM)) / 60 * 100) / 100;

    dbHelper.prepare('UPDATE attendance SET clock_out=?, clock_out_photo=?, work_hours=?, overtime_hours=? WHERE id=?')
      .run(currentTime, photo, workHours, overtimeHours, existing.id);

    res.json({
      message: `Presensi pulang berhasil dicatat pada pukul ${currentTime}! Durasi: ${workHours} jam.`,
      data: { clock_in: existing.clock_in, clock_out: currentTime, work_hours: workHours, overtime_hours: overtimeHours, date: today },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Terjadi kesalahan server saat mencatat jam pulang.' });
  }
});

// GET /api/attendance/today
router.get('/today', authenticateToken, (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const attendance = dbHelper.prepare('SELECT * FROM attendance WHERE user_id = ? AND date = ?').get(req.user.id, today);
    res.json({ attendance: attendance || null });
  } catch (err) {
    res.status(500).json({ error: 'Terjadi kesalahan server.' });
  }
});

// GET /api/attendance/history
router.get('/history', authenticateToken, (req, res) => {
  try {
    const { month, year, page = 1, limit = 31 } = req.query;
    let query = 'SELECT * FROM attendance WHERE user_id = ?';
    const params = [req.user.id];
    if (month && year) { query += " AND date LIKE ?"; params.push(`${year}-${month.padStart(2, '0')}%`); }
    query += ' ORDER BY date DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), (parseInt(page) - 1) * parseInt(limit));
    res.json({ attendance: dbHelper.prepare(query).all(...params) });
  } catch (err) {
    res.status(500).json({ error: 'Terjadi kesalahan server.' });
  }
});

// GET /api/attendance/all (Admin)
router.get('/all', authenticateToken, requireAdmin, (req, res) => {
  try {
    const { date, department, status, search, page = 1, limit = 100 } = req.query;
    let conditions = ['1=1'];
    const params = [];

    if (date) { conditions.push('a.date = ?'); params.push(date); }
    if (department) { conditions.push('u.department_id = ?'); params.push(department); }
    if (status) { conditions.push('a.status = ?'); params.push(status); }
    if (search) {
      conditions.push('(u.name LIKE ? OR u.employee_id LIKE ?)');
      params.push(`%${search}%`, `%${search}%`);
    }

    const where = conditions.join(' AND ');
    const total = dbHelper.prepare(`
      SELECT COUNT(*) as total FROM attendance a
      JOIN users u ON a.user_id = u.id WHERE ${where}
    `).get(...params).total;

    const offset = (page - 1) * limit;
    const attendance = dbHelper.prepare(`
      SELECT a.*, u.name, u.employee_id, u.avatar, d.name as department_name
      FROM attendance a
      JOIN users u ON a.user_id = u.id
      LEFT JOIN departments d ON u.department_id = d.id
      WHERE ${where} ORDER BY a.date DESC, a.clock_in DESC LIMIT ? OFFSET ?
    `).all(...params, parseInt(limit), parseInt(offset));

    res.json({ attendance, pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / limit) } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Terjadi kesalahan server.' });
  }
});

// GET /api/attendance/summary (Dashboard)
router.get('/summary', authenticateToken, requireAdmin, (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const totalUsers = dbHelper.prepare('SELECT COUNT(*) as total FROM users WHERE role = "employee" AND is_active = 1').get().total;

    const todayStats = dbHelper.prepare(`
      SELECT
        COUNT(CASE WHEN status = 'present' THEN 1 END) as present,
        COUNT(CASE WHEN status = 'late' THEN 1 END) as late,
        COUNT(CASE WHEN status = 'absent' THEN 1 END) as absent,
        COUNT(CASE WHEN status = 'leave' THEN 1 END) as leave
      FROM attendance WHERE date = ?
    `).get(today);

    const clockedCount = (todayStats.present || 0) + (todayStats.late || 0);
    const absentCount = Math.max(0, totalUsers - clockedCount - (todayStats.leave || 0));

    const currentMonth = today.substring(0, 7);
    const monthStats = dbHelper.prepare(`
      SELECT
        AVG(work_hours) as avg_work_hours,
        SUM(overtime_hours) as total_overtime
      FROM attendance WHERE date LIKE ? AND work_hours IS NOT NULL
    `).get(`${currentMonth}%`);

    res.json({
      today: {
        total_employees: totalUsers,
        present: todayStats.present || 0,
        late: todayStats.late || 0,
        absent: absentCount,
        leave: todayStats.leave || 0,
      },
      this_month: {
        avg_work_hours: monthStats.avg_work_hours ? Math.round(monthStats.avg_work_hours * 10) / 10 : 0,
        total_overtime: monthStats.total_overtime ? Math.round(monthStats.total_overtime * 10) / 10 : 0,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Terjadi kesalahan server.' });
  }
});

// GET /api/attendance/report (Admin Report)
router.get('/report', authenticateToken, requireAdmin, (req, res) => {
  try {
    const { start_date, end_date, department } = req.query;
    if (!start_date || !end_date) return res.status(400).json({ error: 'start_date dan end_date wajib diisi.' });

    let query = `
      SELECT a.*, u.name, u.employee_id, d.name as department_name
      FROM attendance a
      JOIN users u ON a.user_id = u.id
      LEFT JOIN departments d ON u.department_id = d.id
      WHERE a.date >= ? AND a.date <= ?
    `;
    const params = [start_date, end_date];
    if (department) { query += ' AND u.department_id = ?'; params.push(department); }
    query += ' ORDER BY a.date DESC, u.name ASC';

    const report = dbHelper.prepare(query).all(...params);

    const summary = {
      total_records: report.length,
      present: report.filter(r => r.status === 'present').length,
      late: report.filter(r => r.status === 'late').length,
      absent: report.filter(r => r.status === 'absent').length,
      leave: report.filter(r => r.status === 'leave').length,
      total_overtime: Math.round(report.reduce((sum, r) => sum + (r.overtime_hours || 0), 0) * 10) / 10,
    };

    res.json({ report, summary });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Terjadi kesalahan server.' });
  }
});

module.exports = router;
