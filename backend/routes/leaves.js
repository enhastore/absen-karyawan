const express = require('express');
const router = express.Router();
const { dbHelper } = require('../config/database');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

router.get('/', authenticateToken, (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    let conditions = ['1=1'];
    const params = [];

    if (req.user.role !== 'admin') { conditions.push('lr.user_id = ?'); params.push(req.user.id); }
    if (status) { conditions.push('lr.status = ?'); params.push(status); }

    const where = conditions.join(' AND ');
    const leaves = dbHelper.prepare(`
      SELECT lr.*, u.name as user_name, u.employee_id, u.position, d.name as department_name, u2.name as approver_name
      FROM leave_requests lr JOIN users u ON lr.user_id = u.id
      LEFT JOIN departments d ON u.department_id = d.id LEFT JOIN users u2 ON lr.approved_by = u2.id
      WHERE ${where} ORDER BY lr.created_at DESC LIMIT ? OFFSET ?
    `).all(...params, parseInt(limit), (parseInt(page) - 1) * parseInt(limit));
    res.json({ leaves });
  } catch (err) { res.status(500).json({ error: 'Terjadi kesalahan server.' }); }
});

router.post('/', authenticateToken, (req, res) => {
  try {
    const { start_date, end_date, type, reason } = req.body;
    if (!start_date || !end_date || !type) return res.status(400).json({ error: 'Tanggal dan tipe izin wajib diisi.' });

    dbHelper.prepare('INSERT INTO leave_requests (user_id, start_date, end_date, type, reason) VALUES (?,?,?,?,?)')
      .run(req.user.id, start_date, end_date, type, reason || null);

    const admins = dbHelper.prepare("SELECT id FROM users WHERE role = 'admin' AND is_active = 1").all();
    admins.forEach(admin => {
      dbHelper.prepare("INSERT INTO notifications (user_id, title, message, type) VALUES (?,?,?,'info')")
        .run(admin.id, 'Pengajuan Izin Baru', `${req.user.name} mengajukan ${type}`);
    });

    res.status(201).json({ message: 'Pengajuan izin berhasil dikirim.' });
  } catch (err) { res.status(500).json({ error: 'Terjadi kesalahan server.' }); }
});

router.put('/:id/approve', authenticateToken, requireAdmin, (req, res) => {
  try {
    const { status } = req.body;
    if (!['approved', 'rejected'].includes(status)) return res.status(400).json({ error: 'Status harus approved atau rejected.' });

    const leave = dbHelper.prepare('SELECT * FROM leave_requests WHERE id = ?').get(req.params.id);
    if (!leave) return res.status(404).json({ error: 'Pengajuan tidak ditemukan.' });

    dbHelper.prepare('UPDATE leave_requests SET status=?, approved_by=?, approved_at=CURRENT_TIMESTAMP WHERE id=?').run(status, req.user.id, req.params.id);

    if (status === 'approved') {
      const start = new Date(leave.start_date);
      const end = new Date(leave.end_date);
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().split('T')[0];
        try {
          dbHelper.prepare("INSERT INTO attendance (user_id, date, status, notes) VALUES (?,?,'leave',?)").run(leave.user_id, dateStr, `${leave.type}: ${leave.reason || '-'}`);
        } catch(e) {}
      }
    }

    dbHelper.prepare("INSERT INTO notifications (user_id, title, message, type) VALUES (?,?,?,?)")
      .run(leave.user_id, `Izin ${status === 'approved' ? 'Disetujui' : 'Ditolak'}`,
           `Pengajuan ${leave.type} Anda telah ${status === 'approved' ? 'disetujui' : 'ditolak'}.`,
           status === 'approved' ? 'success' : 'warning');

    res.json({ message: `Pengajuan izin berhasil ${status === 'approved' ? 'disetujui' : 'ditolak'}.` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Terjadi kesalahan server.' });
  }
});

module.exports = router;
