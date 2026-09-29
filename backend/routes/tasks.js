const express = require('express');
const router = express.Router();
const { dbHelper } = require('../config/database');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

// GET /api/tasks
router.get('/', authenticateToken, (req, res) => {
  try {
    const { status, priority, assigned_to, department_id, search, page = 1, limit = 20 } = req.query;
    let conditions = ['1=1'];
    const params = [];

    if (req.user.role !== 'admin') { conditions.push('t.assigned_to = ?'); params.push(req.user.id); }
    if (status) { conditions.push('t.status = ?'); params.push(status); }
    if (priority) { conditions.push('t.priority = ?'); params.push(priority); }
    if (assigned_to) { conditions.push('t.assigned_to = ?'); params.push(assigned_to); }
    if (department_id) { conditions.push('t.department_id = ?'); params.push(department_id); }
    if (search) { conditions.push('(t.title LIKE ? OR t.description LIKE ?)'); params.push(`%${search}%`, `%${search}%`); }

    const where = conditions.join(' AND ');
    const total = dbHelper.prepare(`SELECT COUNT(*) as total FROM tasks t WHERE ${where}`).get(...params).total;

    const tasks = dbHelper.prepare(`
      SELECT t.*, u1.name as assigned_name, u1.employee_id as assigned_employee_id,
             u2.name as creator_name, d.name as department_name
      FROM tasks t LEFT JOIN users u1 ON t.assigned_to = u1.id
      LEFT JOIN users u2 ON t.created_by = u2.id LEFT JOIN departments d ON t.department_id = d.id
      WHERE ${where} ORDER BY CASE t.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END, t.deadline ASC
      LIMIT ? OFFSET ?
    `).all(...params, parseInt(limit), (parseInt(page) - 1) * parseInt(limit));

    res.json({ tasks, pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / limit) } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Terjadi kesalahan server.' });
  }
});

// GET /api/tasks/summary
router.get('/summary', authenticateToken, (req, res) => {
  try {
    let w = '';
    const p = [];
    if (req.user.role !== 'admin') { w = 'WHERE assigned_to = ?'; p.push(req.user.id); }

    const todo = dbHelper.prepare(`SELECT COUNT(*) as count FROM tasks ${w} ${w ? 'AND' : 'WHERE'} status = 'todo'`).get(...p).count;
    const inProgress = dbHelper.prepare(`SELECT COUNT(*) as count FROM tasks ${w} ${w ? 'AND' : 'WHERE'} status = 'in_progress'`).get(...p).count;
    const done = dbHelper.prepare(`SELECT COUNT(*) as count FROM tasks ${w} ${w ? 'AND' : 'WHERE'} status = 'done'`).get(...p).count;
    const today = new Date().toISOString().split('T')[0];
    const overdue = dbHelper.prepare(`SELECT COUNT(*) as count FROM tasks ${w} ${w ? 'AND' : 'WHERE'} deadline < ? AND status != 'done' AND status != 'cancelled'`).get(...p, today).count;

    res.json({ todo, in_progress: inProgress, done, overdue, total: todo + inProgress + done });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Terjadi kesalahan server.' });
  }
});

// GET /api/tasks/:id
router.get('/:id', authenticateToken, (req, res) => {
  try {
    const task = dbHelper.prepare(`
      SELECT t.*, u1.name as assigned_name, u1.employee_id as assigned_employee_id,
             u2.name as creator_name, d.name as department_name
      FROM tasks t LEFT JOIN users u1 ON t.assigned_to = u1.id
      LEFT JOIN users u2 ON t.created_by = u2.id LEFT JOIN departments d ON t.department_id = d.id
      WHERE t.id = ?
    `).get(req.params.id);
    if (!task) return res.status(404).json({ error: 'Tugas tidak ditemukan.' });
    if (req.user.role !== 'admin' && task.assigned_to !== req.user.id) return res.status(403).json({ error: 'Akses ditolak.' });
    res.json({ task });
  } catch (err) {
    res.status(500).json({ error: 'Terjadi kesalahan server.' });
  }
});

// POST /api/tasks
router.post('/', authenticateToken, requireAdmin, (req, res) => {
  try {
    const { title, description, assigned_to, department_id, priority, deadline } = req.body;
    if (!title) return res.status(400).json({ error: 'Judul tugas wajib diisi.' });

    const result = dbHelper.prepare('INSERT INTO tasks (title, description, assigned_to, department_id, created_by, priority, deadline) VALUES (?,?,?,?,?,?,?)')
      .run(title, description || null, assigned_to || null, department_id || null, req.user.id, priority || 'medium', deadline || null);

    if (assigned_to) {
      dbHelper.prepare("INSERT INTO notifications (user_id, title, message, type) VALUES (?,?,?,'task')")
        .run(assigned_to, 'Tugas Baru', `Anda mendapat tugas baru: ${title}`);
    }

    const task = dbHelper.prepare(`
      SELECT t.*, u1.name as assigned_name, u2.name as creator_name
      FROM tasks t LEFT JOIN users u1 ON t.assigned_to = u1.id LEFT JOIN users u2 ON t.created_by = u2.id WHERE t.id = ?
    `).get(result.lastInsertRowid);

    res.status(201).json({ message: 'Tugas berhasil dibuat.', task });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Terjadi kesalahan server.' });
  }
});

// PUT /api/tasks/:id
router.put('/:id', authenticateToken, (req, res) => {
  try {
    const task = dbHelper.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
    if (!task) return res.status(404).json({ error: 'Tugas tidak ditemukan.' });

    if (req.user.role !== 'admin') {
      if (task.assigned_to !== req.user.id) return res.status(403).json({ error: 'Akses ditolak.' });
      const { status } = req.body;
      if (!status) return res.status(400).json({ error: 'Hanya status yang bisa diupdate.' });
      const completedAt = status === 'done' ? new Date().toISOString() : null;
      dbHelper.prepare('UPDATE tasks SET status=?, completed_at=?, updated_at=CURRENT_TIMESTAMP WHERE id=?').run(status, completedAt, req.params.id);
    } else {
      const { title, description, assigned_to, department_id, priority, status, deadline } = req.body;
      const completedAt = status === 'done' ? new Date().toISOString() : null;
      dbHelper.prepare('UPDATE tasks SET title=?, description=?, assigned_to=?, department_id=?, priority=?, status=?, deadline=?, completed_at=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')
        .run(title || task.title, description !== undefined ? description : task.description,
             assigned_to !== undefined ? assigned_to : task.assigned_to,
             department_id !== undefined ? department_id : task.department_id,
             priority || task.priority, status || task.status,
             deadline !== undefined ? deadline : task.deadline, completedAt, req.params.id);

      if (assigned_to && assigned_to !== task.assigned_to) {
        dbHelper.prepare("INSERT INTO notifications (user_id, title, message, type) VALUES (?,?,?,'task')")
          .run(assigned_to, 'Tugas Baru', `Anda mendapat tugas: ${title || task.title}`);
      }
    }

    const updated = dbHelper.prepare(`
      SELECT t.*, u1.name as assigned_name, u2.name as creator_name, d.name as department_name
      FROM tasks t LEFT JOIN users u1 ON t.assigned_to = u1.id LEFT JOIN users u2 ON t.created_by = u2.id
      LEFT JOIN departments d ON t.department_id = d.id WHERE t.id = ?
    `).get(req.params.id);

    res.json({ message: 'Tugas berhasil diupdate.', task: updated });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Terjadi kesalahan server.' });
  }
});

// DELETE /api/tasks/:id
router.delete('/:id', authenticateToken, requireAdmin, (req, res) => {
  try {
    const result = dbHelper.prepare('DELETE FROM tasks WHERE id = ?').run(req.params.id);
    if (result.changes === 0) return res.status(404).json({ error: 'Tugas tidak ditemukan.' });
    res.json({ message: 'Tugas berhasil dihapus.' });
  } catch (err) {
    res.status(500).json({ error: 'Terjadi kesalahan server.' });
  }
});

module.exports = router;
