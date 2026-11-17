const express = require('express');
const router = express.Router();
const { dbHelper, saveDatabaseAsync } = require('../config/database');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const upload = require('../middleware/upload');
const { getWIB, getWIBDate, getWIBTime } = require('../config/timezone');
const { supabase } = require('../config/supabase');

function unpackSupabaseAttendance(row) {
  if (!row) return row;
  let accounts_created = row.accounts_created || 0;
  let work_report = row.work_report || null;
  let daily_earnings = row.daily_earnings || 0;
  let rate_per_account = row.rate_per_account || 500;
  let notes = row.notes;

  if (notes && typeof notes === 'string' && notes.startsWith('{"accounts_created":')) {
    try {
      const parsed = JSON.parse(notes);
      accounts_created = parsed.accounts_created !== undefined ? parsed.accounts_created : accounts_created;
      work_report = parsed.work_report !== undefined ? parsed.work_report : work_report;
      daily_earnings = parsed.daily_earnings !== undefined ? parsed.daily_earnings : daily_earnings;
      rate_per_account = parsed.rate_per_account !== undefined ? parsed.rate_per_account : rate_per_account;
      notes = parsed.user_notes !== undefined ? parsed.user_notes : null;
    } catch (e) {}
  }

  return {
    ...row,
    accounts_created,
    work_report,
    daily_earnings,
    rate_per_account,
    notes
  };
}

// POST /api/attendance/clock-in (Instant, GPS removed)
router.post('/clock-in', authenticateToken, upload.single('photo'), async (req, res) => {
  try {
    const userId = req.user.id;
    const wib = getWIB();
    const today = (req.body.client_date && /^\d{4}-\d{2}-\d{2}$/.test(req.body.client_date)) ? req.body.client_date : wib.date;
    const currentTime = (req.body.client_time && /^([01]\d|2[0-3]):[0-5]\d$/.test(req.body.client_time)) ? req.body.client_time : wib.time;

    let existing = dbHelper.prepare('SELECT * FROM attendance WHERE user_id = ? AND date = ?').get(userId, today);
    if (!existing && supabase) {
      try {
        const { data: sRow } = await supabase.from('attendance')
          .select('*')
          .eq('user_id', userId)
          .eq('date', today)
          .maybeSingle();
        if (sRow) existing = sRow;
      } catch (e) {}
    }
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

    // Persist to Supabase cloud storage & table
    if (typeof saveDatabaseAsync === 'function') {
      await saveDatabaseAsync();
    }
    if (supabase) {
      try {
        await supabase.from('attendance').upsert({
          user_id: userId,
          date: today,
          clock_in: currentTime,
          status: status,
          notes: notes || null
        }, { onConflict: 'user_id,date' });
      } catch (e) {}
    }

    res.json({
      message: `Presensi masuk berhasil! Status: ${status === 'late' ? 'Terlambat' : 'Tepat Waktu'} (${currentTime} WIB)`,
      data: { time: currentTime, status, date: today },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Terjadi kesalahan server saat mencatat kehadiran.' });
  }
});

// POST /api/attendance/clock-out (Instant, GPS removed)
router.post('/clock-out', authenticateToken, upload.single('photo'), async (req, res) => {
  try {
    const userId = req.user.id;
    const wib = getWIB();
    const today = (req.body.client_date && /^\d{4}-\d{2}-\d{2}$/.test(req.body.client_date)) ? req.body.client_date : wib.date;
    const currentTime = (req.body.client_time && /^([01]\d|2[0-3]):[0-5]\d$/.test(req.body.client_time)) ? req.body.client_time : wib.time;

    let existing = dbHelper.prepare('SELECT * FROM attendance WHERE user_id = ? AND date = ?').get(userId, today);
    if (!existing && supabase) {
      try {
        const { data: sRow } = await supabase.from('attendance')
          .select('*')
          .eq('user_id', userId)
          .eq('date', today)
          .maybeSingle();
        if (sRow) {
          try {
            dbHelper.prepare('INSERT OR IGNORE INTO attendance (user_id, date, clock_in, status, notes) VALUES (?, ?, ?, ?, ?)')
              .run(userId, today, sRow.clock_in, sRow.status, sRow.notes);
            existing = dbHelper.prepare('SELECT * FROM attendance WHERE user_id = ? AND date = ?').get(userId, today);
          } catch (e) {}
          if (!existing) existing = sRow;
        }
      } catch (e) {}
    }

    if (!existing || !existing.clock_in) {
      let unclosed = dbHelper.prepare('SELECT * FROM attendance WHERE user_id = ? AND clock_out IS NULL ORDER BY date DESC, id DESC LIMIT 1').get(userId);
      if (!unclosed && supabase) {
        try {
          const { data: sUnclosed } = await supabase.from('attendance')
            .select('*')
            .eq('user_id', userId)
            .is('clock_out', null)
            .order('date', { ascending: false })
            .limit(1)
            .maybeSingle();
          if (sUnclosed) {
            try {
              dbHelper.prepare('INSERT OR IGNORE INTO attendance (user_id, date, clock_in, status, notes) VALUES (?, ?, ?, ?, ?)')
                .run(userId, sUnclosed.date, sUnclosed.clock_in, sUnclosed.status, sUnclosed.notes);
              unclosed = dbHelper.prepare('SELECT * FROM attendance WHERE user_id = ? AND date = ?').get(userId, sUnclosed.date);
            } catch (e) {}
            if (!unclosed) unclosed = sUnclosed;
          }
        } catch (e) {}
      }

      if (unclosed && unclosed.clock_in) {
        existing = unclosed;
      } else {
        return res.status(400).json({ error: 'Anda belum mencatat jam masuk hari ini.' });
      }
    }
    if (existing.clock_out) return res.status(400).json({ error: 'Anda sudah mencatat jam pulang hari ini.' });

    const user = dbHelper.prepare('SELECT name, salary_system, rate_per_account, base_salary, daily_target, target_bonus FROM users WHERE id = ?').get(userId);
    const ratePerAccount = (user && user.rate_per_account) ? parseInt(user.rate_per_account, 10) : 500;

    const { notes, work_report, accounts_created } = req.body;
    const photo = req.file ? `/uploads/attendance/${req.file.filename}` : null;
    const accountsCount = (accounts_created !== undefined && accounts_created !== null && accounts_created !== '')
      ? Math.max(0, parseInt(accounts_created, 10) || 0)
      : 0;
    const reportNotes = (work_report !== undefined && work_report !== null && String(work_report).trim() !== '')
      ? String(work_report).trim()
      : (notes || null);

    const [inH, inM] = existing.clock_in.split(':').map(Number);
    const [outH, outM] = currentTime.split(':').map(Number);
    let diffMinutes = (outH * 60 + outM) - (inH * 60 + inM);
    if (diffMinutes < 0) diffMinutes += 24 * 60;
    const workHours = Math.max(0, Math.round((diffMinutes / 60) * 100) / 100);

    const workEnd = dbHelper.prepare("SELECT value FROM settings WHERE key = 'work_end'").get();
    const endTime = workEnd ? workEnd.value : '17:00';
    const [endH, endM] = endTime.split(':').map(Number);
    const overtimeHours = Math.round(Math.max(0, (outH * 60 + outM) - (endH * 60 + endM)) / 60 * 100) / 100;

    // Hitung pendapatan sementara hari ini: Jumlah Akun x Tarif per Akun
    const dailyEarnings = accountsCount * ratePerAccount;

    if (existing.id) {
      dbHelper.prepare(`
        UPDATE attendance 
        SET clock_out=?, clock_out_photo=?, work_hours=?, overtime_hours=?, 
            accounts_created=?, rate_per_account=?, daily_earnings=?, 
            work_report=?, notes=? 
        WHERE id=?
      `).run(currentTime, photo, workHours, overtimeHours, accountsCount, ratePerAccount, dailyEarnings, reportNotes, notes || existing.notes || null, existing.id);
    } else {
      dbHelper.prepare(`
        INSERT OR REPLACE INTO attendance (
          user_id, date, clock_in, clock_out, clock_out_photo, work_hours, overtime_hours,
          accounts_created, rate_per_account, daily_earnings, work_report, notes, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(userId, existing.date || today, existing.clock_in, currentTime, photo, workHours, overtimeHours,
             accountsCount, ratePerAccount, dailyEarnings, reportNotes, notes || existing.notes || null, existing.status || 'present');
    }

    // Persist to Supabase cloud storage & table
    if (typeof saveDatabaseAsync === 'function') {
      await saveDatabaseAsync();
    }
    if (supabase) {
      try {
        await supabase.from('attendance').upsert({
          user_id: userId,
          date: today,
          clock_in: existing.clock_in,
          clock_out: currentTime,
          status: existing.status,
          work_hours: workHours,
          overtime_hours: overtimeHours,
          accounts_created: accountsCount,
          rate_per_account: ratePerAccount,
          daily_earnings: dailyEarnings,
          work_report: reportNotes,
          notes: notes || existing.notes || null
        }, { onConflict: 'user_id,date' });
      } catch (e) {}
    }

    res.json({
      message: `Presensi pulang & laporan (${accountsCount} akun) berhasil dicatat! Pendapatan sementara hari ini: Rp${dailyEarnings.toLocaleString('id-ID')}`,
      data: {
        employee_name: user ? user.name : req.user.name,
        date: today,
        clock_in: existing.clock_in,
        clock_out: currentTime,
        work_hours: workHours,
        overtime_hours: overtimeHours,
        accounts_created: accountsCount,
        rate_per_account: ratePerAccount,
        daily_earnings: dailyEarnings,
        work_report: reportNotes
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Terjadi kesalahan server saat mencatat jam pulang.' });
  }
});

// GET /api/attendance/today
router.get('/today', authenticateToken, async (req, res) => {
  try {
    const today = req.query.date || getWIBDate();
    let attendance = null;

    if (supabase) {
      try {
        const { data: sRow } = await supabase.from('attendance')
          .select('*')
          .eq('user_id', req.user.id)
          .eq('date', today)
          .maybeSingle();
        if (sRow) {
          const user = dbHelper.prepare('SELECT rate_per_account, daily_target, salary_system, name FROM users WHERE id = ?').get(req.user.id);
          const unpacked = unpackSupabaseAttendance(sRow);
          attendance = {
            ...unpacked,
            default_rate: user?.rate_per_account || 500,
            daily_target: user?.daily_target || 0,
            salary_system: user?.salary_system || 'per_account',
            user_name: user?.name || req.user.name
          };
        }
      } catch (e) {}
    }

    if (!attendance) {
      attendance = dbHelper.prepare(`
        SELECT a.*, u.rate_per_account as default_rate, u.daily_target, u.salary_system, u.name as user_name
        FROM attendance a
        JOIN users u ON a.user_id = u.id
        WHERE a.user_id = ? AND a.date = ?
      `).get(req.user.id, today);
    }

    // If no attendance today, check if there is an unclosed session from prior date
    if (!attendance) {
      const ongoing = dbHelper.prepare(`
        SELECT a.*, u.rate_per_account as default_rate, u.daily_target, u.salary_system, u.name as user_name
        FROM attendance a
        JOIN users u ON a.user_id = u.id
        WHERE a.user_id = ? AND a.clock_out IS NULL
        ORDER BY a.date DESC, a.id DESC LIMIT 1
      `).get(req.user.id);
      if (ongoing) attendance = ongoing;
    }

    // If no attendance yet, also get user's default rate
    let userRate = 500;
    let userName = req.user.name;
    const user = dbHelper.prepare('SELECT name, rate_per_account, daily_target, salary_system FROM users WHERE id = ?').get(req.user.id);
    if (user) {
      userRate = user.rate_per_account || 500;
      userName = user.name;
    }

    // Ambil catatan khusus/memo terbaru dari admin untuk karyawan ini
    let adminNotes = [];
    try {
      adminNotes = dbHelper.prepare(`
        SELECT id, note, category, author_name, created_at
        FROM employee_notes
        WHERE user_id = ?
        ORDER BY created_at DESC
        LIMIT 5
      `).all(req.user.id);
    } catch (e) {}

    res.json({
      attendance: attendance || null,
      user_rate: userRate,
      user_name: userName,
      user_target: user ? user.daily_target : 0,
      admin_notes: adminNotes
    });
  } catch (err) {
    res.status(500).json({ error: 'Terjadi kesalahan server.' });
  }
});

// GET /api/attendance/history
router.get('/history', authenticateToken, async (req, res) => {
  try {
    const { month, year, page = 1, limit = 31 } = req.query;

    if (supabase) {
      try {
        let q = supabase.from('attendance').select('*').eq('user_id', req.user.id);
        if (month && year) {
          const prefix = `${year}-${String(month).padStart(2, '0')}`;
          q = q.gte('date', `${prefix}-01`).lte('date', `${prefix}-31`);
        }
        const { data: sData } = await q.order('date', { ascending: false });
        if (sData && sData.length > 0) {
          const offset = (parseInt(page) - 1) * parseInt(limit);
          const paginated = sData.slice(offset, offset + parseInt(limit)).map(unpackSupabaseAttendance);
          return res.json({ attendance: paginated });
        }
      } catch (e) {}
    }

    let query = 'SELECT * FROM attendance WHERE user_id = ?';
    const params = [req.user.id];
    if (month && year) { query += " AND date LIKE ?"; params.push(`${year}-${String(month).padStart(2, '0')}%`); }
    query += ' ORDER BY date DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), (parseInt(page) - 1) * parseInt(limit));
    res.json({ attendance: dbHelper.prepare(query).all(...params) });
  } catch (err) {
    res.status(500).json({ error: 'Terjadi kesalahan server.' });
  }
});

// GET /api/attendance/all (Admin)
router.get('/all', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { date, department, status, search, page = 1, limit = 100 } = req.query;

    if (supabase) {
      try {
        let q = supabase.from('attendance').select('*');
        if (date) q = q.eq('date', date);
        if (status) q = q.eq('status', status);
        const { data: sData } = await q.order('date', { ascending: false }).order('clock_in', { ascending: false });
        if (sData && sData.length > 0) {
          const empList = dbHelper.prepare(`
            SELECT u.id, u.employee_id, u.name, u.avatar, d.name as department_name, u.department_id
            FROM users u
            LEFT JOIN departments d ON u.department_id = d.id
          `).all();
          const empMap = {};
          empList.forEach(e => { empMap[e.id] = e; });

          let filtered = sData.map(row => {
            const a = unpackSupabaseAttendance(row);
            const e = empMap[a.user_id] || {};
            return {
              ...a,
              name: e.name || 'Karyawan',
              employee_id: e.employee_id || '-',
              avatar: e.avatar || null,
              department_name: e.department_name || '-',
              department_id: e.department_id
            };
          });

          if (department) filtered = filtered.filter(f => String(f.department_id) === String(department));
          if (search) {
            const sLower = search.toLowerCase();
            filtered = filtered.filter(f => (f.name && f.name.toLowerCase().includes(sLower)) || (f.employee_id && f.employee_id.toLowerCase().includes(sLower)));
          }

          const offset = (parseInt(page) - 1) * parseInt(limit);
          const paginated = filtered.slice(offset, offset + parseInt(limit));
          return res.json({ attendance: paginated, pagination: { page: parseInt(page), limit: parseInt(limit), total: filtered.length, pages: Math.ceil(filtered.length / limit) } });
        }
      } catch (e) {}
    }

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

// GET /api/attendance/summary (Dashboard Admin - sesuai spek Dashboard Absensi ENHA)
router.get('/summary', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const today = req.query.date || getWIBDate();

    // Ambil seluruh karyawan aktif
    const employees = dbHelper.prepare(`
      SELECT u.id, u.employee_id, u.name, u.email, u.position, u.phone, u.avatar,
             u.rate_per_account, u.salary_system, u.daily_target,
             d.name as department_name
      FROM users u
      LEFT JOIN departments d ON u.department_id = d.id
      WHERE u.role = 'employee' AND u.is_active = 1
      ORDER BY u.name ASC
    `).all();

    // Ambil data absensi hari ini (Utamakan dari Supabase Cloud)
    let todayAttendances = [];
    if (supabase) {
      try {
        const { data: sAtt } = await supabase.from('attendance').select('*').eq('date', today);
        if (sAtt && sAtt.length > 0) {
          todayAttendances = sAtt.map(unpackSupabaseAttendance);
        }
      } catch (e) {}
    }
    if (todayAttendances.length === 0) {
      todayAttendances = dbHelper.prepare(`
        SELECT * FROM attendance WHERE date = ?
      `).all(today);
    }

    // Ambil data cuti/izin yang aktif hari ini
    const todayLeaves = dbHelper.prepare(`
      SELECT user_id, type, reason FROM leave_requests
      WHERE date(?) >= date(start_date) AND date(?) <= date(end_date) AND status = 'approved'
    `).all(today, today);

    const attMap = {};
    todayAttendances.forEach(a => { attMap[a.user_id] = a; });

    const leaveMap = {};
    todayLeaves.forEach(l => { leaveMap[l.user_id] = l; });

    let startedCount = 0;
    let finishedCount = 0;
    let notStartedCount = 0;
    let workingNowCount = 0;
    let absentCount = 0;
    let leaveCount = 0;
    let totalAccountsToday = 0;
    let totalEarningsToday = 0;

    const employeeList = employees.map(emp => {
      const att = attMap[emp.id];
      const leave = leaveMap[emp.id];
      
      let status = 'not_started';
      let statusLabel = 'Belum mulai';
      let statusColor = '#eab308'; // yellow
      let statusDot = '🟡';

      if (leave) {
        status = 'leave';
        statusLabel = 'Izin';
        statusColor = '#f97316'; // orange
        statusDot = '🟠';
        leaveCount++;
        return {
          id: emp.id,
          employee_id: emp.employee_id,
          name: emp.name,
          department_name: emp.department_name,
          position: emp.position,
          status,
          status_label: statusLabel,
          status_color: statusColor,
          status_dot: statusDot,
          clock_in: '-',
          clock_out: '-',
          work_hours: 0,
          accounts_created: 0,
          rate_per_account: emp.rate_per_account || 500,
          daily_earnings: 0,
          work_report: leave.reason || 'Izin/Cuti disetujui'
        };
      } else if (att) {
        if (att.status === 'absent') {
          status = 'absent';
          statusLabel = 'Tidak hadir';
          statusColor = '#ef4444'; // red
          statusDot = '🔴';
          absentCount++;
        } else if (att.clock_in && att.clock_out) {
          status = 'finished';
          statusLabel = 'Sudah selesai';
          statusColor = '#3b82f6'; // blue
          statusDot = '🔵';
          startedCount++;
          finishedCount++;
        } else if (att.clock_in && !att.clock_out) {
          status = 'working';
          statusLabel = 'Sedang bekerja';
          statusColor = '#22c55e'; // green
          statusDot = '🟢';
          startedCount++;
          workingNowCount++;
        } else {
          status = 'not_started';
          statusLabel = 'Belum mulai';
          statusColor = '#eab308';
          statusDot = '🟡';
          notStartedCount++;
        }

        const acc = att.accounts_created || 0;
        const rate = att.rate_per_account || emp.rate_per_account || 500;
        const earnings = (att.daily_earnings !== undefined && att.daily_earnings !== null && att.daily_earnings > 0)
          ? att.daily_earnings
          : (acc * rate);

        totalAccountsToday += acc;
        totalEarningsToday += earnings;

        return {
          id: emp.id,
          attendance_id: att.id,
          employee_id: emp.employee_id,
          name: emp.name,
          department_name: emp.department_name,
          position: emp.position,
          status,
          status_label: statusLabel,
          status_color: statusColor,
          status_dot: statusDot,
          clock_in: att.clock_in || '-',
          clock_out: att.clock_out || '-',
          work_hours: att.work_hours || 0,
          accounts_created: acc,
          rate_per_account: rate,
          daily_earnings: earnings,
          work_report: att.work_report || ''
        };
      } else {
        notStartedCount++;
        return {
          id: emp.id,
          employee_id: emp.employee_id,
          name: emp.name,
          department_name: emp.department_name,
          position: emp.position,
          status: 'not_started',
          status_label: 'Belum mulai',
          status_color: '#eab308',
          status_dot: '🟡',
          clock_in: '-',
          clock_out: '-',
          work_hours: 0,
          accounts_created: 0,
          rate_per_account: emp.rate_per_account || 500,
          daily_earnings: 0,
          work_report: ''
        };
      }
    });

    const currentMonth = today.substring(0, 7);
    const monthStats = dbHelper.prepare(`
      SELECT
        AVG(work_hours) as avg_work_hours,
        SUM(overtime_hours) as total_overtime,
        SUM(accounts_created) as total_accounts,
        SUM(daily_earnings) as total_earnings
      FROM attendance WHERE date LIKE ? AND work_hours IS NOT NULL
    `).get(`${currentMonth}%`);

    res.json({
      dashboard: {
        total_karyawan: employees.length,
        sudah_mulai_kerja: startedCount,
        sudah_selesai_kerja: finishedCount,
        belum_mulai_kerja: notStartedCount,
        sedang_bekerja: workingNowCount,
        tidak_hadir: absentCount,
        izin: leaveCount,
        total_akun_selesai_hari_ini: totalAccountsToday,
        total_estimasi_upah_hari_ini: totalEarningsToday,
      },
      employees: employeeList,
      today: {
        total_employees: employees.length,
        present: workingNowCount + finishedCount,
        late: 0,
        absent: absentCount,
        leave: leaveCount,
        total_accounts: totalAccountsToday,
      },
      this_month: {
        avg_work_hours: monthStats?.avg_work_hours ? Math.round(monthStats.avg_work_hours * 10) / 10 : 0,
        total_overtime: monthStats?.total_overtime ? Math.round(monthStats.total_overtime * 10) / 10 : 0,
        total_accounts: monthStats?.total_accounts || 0,
        total_earnings: monthStats?.total_earnings || 0,
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Terjadi kesalahan server.' });
  }
});

// GET /api/attendance/monthly-recap (Rekap Bulanan & Penggajian - Gambar 2)
router.get('/monthly-recap', authenticateToken, requireAdmin, (req, res) => {
  try {
    const { month, user_id, department_id } = req.query;
    const targetMonth = month || getWIBDate().substring(0, 7);

    let userQuery = `
      SELECT u.id, u.employee_id, u.name, u.email, u.position, u.phone,
             u.salary_system, u.rate_per_account, u.base_salary, u.daily_target, u.target_bonus,
             d.name as department_name, u.department_id
      FROM users u
      LEFT JOIN departments d ON u.department_id = d.id
      WHERE u.role = 'employee' AND u.is_active = 1
    `;
    const userParams = [];
    if (user_id) { userQuery += ' AND u.id = ?'; userParams.push(user_id); }
    if (department_id) { userQuery += ' AND u.department_id = ?'; userParams.push(department_id); }
    userQuery += ' ORDER BY u.name ASC';

    const employees = dbHelper.prepare(userQuery).all(...userParams);

    // Ambil data absensi bulan target
    const attendances = dbHelper.prepare(`
      SELECT a.*, u.name, u.employee_id, u.rate_per_account as user_rate
      FROM attendance a
      JOIN users u ON a.user_id = u.id
      WHERE a.date LIKE ?
      ORDER BY a.date ASC
    `).all(`${targetMonth}%`);

    // Ambil cuti bulan target
    const leaves = dbHelper.prepare(`
      SELECT * FROM leave_requests
      WHERE status = 'approved' AND (start_date LIKE ? OR end_date LIKE ?)
    `).all(`${targetMonth}%`, `${targetMonth}%`);

    // Kelompokkan per karyawan
    const employeeRecaps = employees.map(emp => {
      const empAtt = attendances.filter(a => a.user_id === emp.id);
      const empLeaves = leaves.filter(l => l.user_id === emp.id);

      const presentRecords = empAtt.filter(a => a.status === 'present' || a.status === 'late' || (a.clock_in && a.status !== 'absent'));
      const daysPresent = presentRecords.length;
      const daysLeave = empLeaves.length;
      const daysAbsent = empAtt.filter(a => a.status === 'absent').length;

      let totalAccounts = 0;
      let totalWages = 0;
      let hasUnpaid = false;

      const records = empAtt.map(a => {
        const acc = a.accounts_created || 0;
        const rate = a.rate_per_account || emp.rate_per_account || 500;
        const earnings = (a.daily_earnings !== undefined && a.daily_earnings !== null && a.daily_earnings > 0)
          ? a.daily_earnings
          : (acc * rate);

        totalAccounts += acc;
        totalWages += earnings;
        if (a.payment_status !== 'paid') hasUnpaid = true;

        return {
          id: a.id,
          date: a.date,
          clock_in: a.clock_in || '-',
          clock_out: a.clock_out || '-',
          work_hours: a.work_hours || 0,
          overtime_hours: a.overtime_hours || 0,
          status: a.status,
          accounts_created: acc,
          rate_per_account: rate,
          daily_earnings: earnings,
          payment_status: a.payment_status || 'unpaid',
          work_report: a.work_report || ''
        };
      });

      // Jika ada gaji tetap atau bonus target
      let bonusEarned = 0;
      if (emp.salary_system === 'fixed_bonus' || (emp.target_bonus && emp.target_bonus > 0)) {
        if (emp.daily_target && totalAccounts >= (emp.daily_target * Math.max(1, daysPresent))) {
          bonusEarned = emp.target_bonus;
          totalWages += bonusEarned;
        }
      }

      const paymentStatus = (records.length > 0 && !hasUnpaid) ? 'Sudah dibayar' : 'Belum dibayar';

      return {
        user_id: emp.id,
        employee_id: emp.employee_id,
        name: emp.name,
        department_name: emp.department_name || '-',
        position: emp.position || 'Karyawan',
        phone: emp.phone || '-',
        salary_system: emp.salary_system || 'per_account',
        rate_per_account: emp.rate_per_account || 500,
        base_salary: emp.base_salary || 0,
        daily_target: emp.daily_target || 0,
        target_bonus: emp.target_bonus || 0,
        bonus_earned: bonusEarned,
        days_present: daysPresent,
        days_leave: daysLeave,
        days_absent: daysAbsent,
        total_accounts: totalAccounts,
        total_wages: totalWages,
        payment_status: paymentStatus,
        records
      };
    });

    // Summary Keseluruhan / Terpilih (Sesuai Format Gambar 2)
    const totalWorkingDays = new Set(attendances.map(a => a.date)).size || 25;
    const totalHadir = employeeRecaps.reduce((sum, e) => sum + e.days_present, 0);
    const totalIzin = employeeRecaps.reduce((sum, e) => sum + e.days_leave, 0);
    const totalAkun = employeeRecaps.reduce((sum, e) => sum + e.total_accounts, 0);
    const totalUpah = employeeRecaps.reduce((sum, e) => sum + e.total_wages, 0);
    const allPaid = employeeRecaps.length > 0 && employeeRecaps.every(e => e.payment_status === 'Sudah dibayar');

    res.json({
      month: targetMonth,
      summary: {
        total_hari_kerja: `${totalWorkingDays} hari`,
        total_hadir: `${totalHadir} hari`,
        total_izin: `${totalIzin} hari`,
        total_akun_selesai: `${totalAkun} akun`,
        total_upah: `Rp${totalUpah.toLocaleString('id-ID')}`,
        total_upah_raw: totalUpah,
        status_pembayaran: allPaid ? 'Sudah dibayar' : 'Belum dibayar',
      },
      employees: employeeRecaps
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Terjadi kesalahan server.' });
  }
});

// PUT /api/attendance/payment-status (Tandai Lunas / Belum Dibayar)
router.put('/payment-status', authenticateToken, requireAdmin, (req, res) => {
  try {
    const { user_id, month, status = 'paid' } = req.body;
    if (!month) return res.status(400).json({ error: 'Bulan wajib disertakan.' });

    if (user_id) {
      dbHelper.prepare(`
        UPDATE attendance SET payment_status = ?
        WHERE user_id = ? AND date LIKE ?
      `).run(status, user_id, `${month}%`);
    } else {
      dbHelper.prepare(`
        UPDATE attendance SET payment_status = ?
        WHERE date LIKE ?
      `).run(status, `${month}%`);
    }

    res.json({ message: `Status pembayaran bulan ${month} berhasil diperbarui menjadi "${status}".` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Terjadi kesalahan server.' });
  }
});

// PUT /api/attendance/:id (Mekanisme Koreksi Presensi oleh Admin)
router.put('/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const attId = req.params.id;
    const existing = dbHelper.prepare('SELECT * FROM attendance WHERE id = ?').get(attId);
    if (!existing) return res.status(404).json({ error: 'Data absensi tidak ditemukan.' });

    const {
      clock_in, clock_out, status, accounts_created, rate_per_account,
      work_report, notes, payment_status, approval_status
    } = req.body;

    const newClockIn = clock_in !== undefined ? clock_in : existing.clock_in;
    const newClockOut = clock_out !== undefined ? clock_out : existing.clock_out;
    const newStatus = status !== undefined ? status : existing.status;
    const newAccounts = accounts_created !== undefined ? parseInt(accounts_created, 10) || 0 : (existing.accounts_created || 0);
    const newRate = rate_per_account !== undefined ? parseInt(rate_per_account, 10) || 500 : (existing.rate_per_account || 500);
    const newEarnings = newAccounts * newRate;
    const newReport = work_report !== undefined ? work_report : existing.work_report;
    const newNotes = notes !== undefined ? notes : existing.notes;
    const newPayStatus = payment_status !== undefined ? payment_status : (existing.payment_status || 'unpaid');
    const newApproval = approval_status !== undefined ? approval_status : (existing.approval_status || 'approved');

    // Hitung ulang durasi jam kerja jika clock_in & clock_out ada
    let workHours = existing.work_hours || 0;
    if (newClockIn && newClockOut) {
      const [inH, inM] = newClockIn.split(':').map(Number);
      const [outH, outM] = newClockOut.split(':').map(Number);
      let diff = (outH * 60 + outM) - (inH * 60 + inM);
      if (diff < 0) diff += 24 * 60;
      workHours = Math.max(0, Math.round((diff / 60) * 100) / 100);
    }

    dbHelper.prepare(`
      UPDATE attendance SET
        clock_in=?, clock_out=?, status=?, work_hours=?,
        accounts_created=?, rate_per_account=?, daily_earnings=?,
        work_report=?, notes=?, payment_status=?, approval_status=?
      WHERE id=?
    `).run(
      newClockIn, newClockOut, newStatus, workHours,
      newAccounts, newRate, newEarnings,
      newReport, newNotes, newPayStatus, newApproval,
      attId
    );

    if (typeof saveDatabaseAsync === 'function') {
      await saveDatabaseAsync();
    }
    if (supabase) {
      try {
        await supabase.from('attendance').upsert({
          user_id: existing.user_id,
          date: existing.date,
          clock_in: newClockIn,
          clock_out: newClockOut,
          status: newStatus,
          work_hours: workHours,
          accounts_created: newAccounts,
          rate_per_account: newRate,
          daily_earnings: newEarnings,
          work_report: newReport,
          notes: newNotes
        }, { onConflict: 'user_id,date' });
      } catch (e) {}
    }

    const updated = dbHelper.prepare('SELECT * FROM attendance WHERE id = ?').get(attId);
    res.json({ message: 'Koreksi absensi berhasil disimpan.', attendance: updated });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Terjadi kesalahan server saat memperbarui absensi.' });
  }
});

// POST /api/attendance/manual (Admin Input Absensi Manual / Koreksi Darurat)
router.post('/manual', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { user_id, date, clock_in, clock_out, status = 'present', accounts_created = 0, rate_per_account, work_report, notes } = req.body;
    if (!user_id || !date) {
      return res.status(400).json({ error: 'Karyawan dan tanggal wajib diisi.' });
    }

    const user = dbHelper.prepare('SELECT rate_per_account FROM users WHERE id = ?').get(user_id);
    const rate = rate_per_account || (user ? user.rate_per_account : 500) || 500;
    const accounts = parseInt(accounts_created, 10) || 0;
    const earnings = accounts * rate;

    let workHours = 0;
    if (clock_in && clock_out) {
      const [inH, inM] = clock_in.split(':').map(Number);
      const [outH, outM] = clock_out.split(':').map(Number);
      let diff = (outH * 60 + outM) - (inH * 60 + inM);
      if (diff < 0) diff += 24 * 60;
      workHours = Math.max(0, Math.round((diff / 60) * 100) / 100);
    }

    const existing = dbHelper.prepare('SELECT id FROM attendance WHERE user_id = ? AND date = ?').get(user_id, date);
    if (existing) {
      dbHelper.prepare(`
        UPDATE attendance SET
          clock_in=?, clock_out=?, status=?, work_hours=?,
          accounts_created=?, rate_per_account=?, daily_earnings=?,
          work_report=?, notes=?, approval_status='approved'
        WHERE id=?
      `).run(clock_in || null, clock_out || null, status, workHours, accounts, rate, earnings, work_report || null, notes || null, existing.id);
    } else {
      dbHelper.prepare(`
        INSERT INTO attendance (
          user_id, date, clock_in, clock_out, status, work_hours,
          accounts_created, rate_per_account, daily_earnings,
          work_report, notes, approval_status, payment_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved', 'unpaid')
      `).run(user_id, date, clock_in || null, clock_out || null, status, workHours, accounts, rate, earnings, work_report || null, notes || null);
    }

    if (typeof saveDatabaseAsync === 'function') {
      await saveDatabaseAsync();
    }
    if (supabase) {
      try {
        await supabase.from('attendance').upsert({
          user_id: user_id,
          date: date,
          clock_in: clock_in || null,
          clock_out: clock_out || null,
          status: status,
          work_hours: workHours,
          accounts_created: accounts,
          rate_per_account: rate,
          daily_earnings: earnings,
          work_report: work_report || null,
          notes: notes || null
        }, { onConflict: 'user_id,date' });
      } catch (e) {}
    }

    return res.json({ message: existing ? 'Data absensi manual berhasil diperbarui.' : 'Absensi manual berhasil dicatat.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Terjadi kesalahan server saat menyimpan absensi manual.' });
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
      total_accounts: report.reduce((sum, r) => sum + (r.accounts_created || 0), 0),
    };

    res.json({ report, summary });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Terjadi kesalahan server.' });
  }
});

module.exports = router;
