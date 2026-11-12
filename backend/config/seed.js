const bcrypt = require('bcryptjs');
const { dbHelper } = require('./database');

async function seed() {
  console.log('🌱 Seeding database with official departments and employees...\n');

  const db = dbHelper;

  // 1. Default Company Settings
  const settings = [
    { key: 'company_name', value: 'ENHA STORE - Ternak Akun & TikTok Affiliate', description: 'Nama usaha / operasional toko digital' },
    { key: 'work_start', value: '08:00', description: 'Jam mulai kerja' },
    { key: 'work_end', value: '17:00', description: 'Jam selesai kerja' },
    { key: 'late_tolerance', value: '15', description: 'Toleransi keterlambatan (menit)' },
    { key: 'require_photo', value: 'false', description: 'Wajib foto saat absen' },
  ];

  settings.forEach(s => {
    try {
      const existing = db.prepare('SELECT key FROM settings WHERE key = ?').get(s.key);
      if (!existing) {
        db.prepare('INSERT INTO settings (key, value, description) VALUES (?, ?, ?)').run(s.key, s.value, s.description);
      }
    } catch (e) {}
  });

  // 2. Default Shifts
  const shifts = [
    ['Shift Pagi (Regular)', '08:00', '17:00', 15, 1],
    ['Shift Siang', '11:00', '19:00', 15, 0],
    ['Shift Sore / Malam', '15:00', '23:00', 15, 0],
  ];
  shifts.forEach(s => {
    try {
      const exists = db.prepare('SELECT id FROM shifts WHERE name = ?').get(s[0]);
      if (!exists) {
        db.prepare('INSERT INTO shifts (name, start_time, end_time, late_tolerance, is_default) VALUES (?, ?, ?, ?, ?)').run(...s);
      }
    } catch (e) {}
  });

  // 3. Official Departments (Sesuai Gambar 1)
  const officialDepts = [
    {
      id: 1,
      name: 'Manage Account',
      description: 'Pengelolaan dan pemeliharaan akun TikTok secara berkala untuk mempersiapkan akun agar memenuhi persyaratan aktivasi TikTok Shop Affiliate.'
    },
    {
      id: 2,
      name: 'Creating Multiple Accounts',
      description: 'Membuat dan menyiapkan akun TikTok dalam jumlah banyak setiap harinya sesuai target produksi yang telah ditentukan.'
    },
    {
      id: 3,
      name: 'Video Production',
      description: 'Memproduksi dan merekam video sebagai bahan konten untuk kebutuhan operasional ternak TikTok.'
    }
  ];

  officialDepts.forEach(d => {
    try {
      const exists = db.prepare('SELECT id FROM departments WHERE id = ? OR name = ?').get(d.id, d.name);
      if (exists) {
        db.prepare('UPDATE departments SET name = ?, description = ? WHERE id = ?').run(d.name, d.description, exists.id);
      } else {
        db.prepare('INSERT INTO departments (id, name, description) VALUES (?, ?, ?)').run(d.id, d.name, d.description);
      }
    } catch (e) {
      console.warn('Dept insert note:', e.message);
    }
  });

  // 4. Admin User (admin@company.com / admin123)
  const adminPassword = bcrypt.hashSync('admin123', 10);
  try {
    const adminExists = db.prepare('SELECT id FROM users WHERE email = ? OR role = "admin"').get('admin@company.com');
    if (!adminExists) {
      db.prepare(`
        INSERT INTO users (employee_id, name, email, password_hash, role, department_id, position, phone, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
      `).run('ADM001', 'Administrator', 'admin@company.com', adminPassword, 'admin', null, 'Owner / Management ENHA', '081234567890');
    }
  } catch (e) {}

  // 5. Official Employee Accounts (Sesuai Gambar 2, 3, 4)
  const employeesData = [
    // --- DEPARTEMEN 1: Manage Account ---
    {
      emp_id: 'EMP001',
      name: 'Naila',
      email: 'naila@company.com',
      raw_password: 'ehsnai06@',
      dept_id: 1,
      position: 'Staff Manage Account TikTok',
      phone: '081234567801',
      salary_system: 'per_account',
      rate: 500,
      base_salary: 0,
      daily_target: 10,
      bonus: 0,
      period_start: 1,
      pay_date: '25'
    },
    {
      emp_id: 'EMP002',
      name: 'Salwa',
      email: 'salwa@company.com',
      raw_password: 'ehssal06@',
      dept_id: 1,
      position: 'Staff Manage Account TikTok',
      phone: '081234567802',
      salary_system: 'per_account',
      rate: 500,
      base_salary: 0,
      daily_target: 10,
      bonus: 0,
      period_start: 1,
      pay_date: '25'
    },
    {
      emp_id: 'EMP003',
      name: 'Lulu',
      email: 'lulu@company.com',
      raw_password: 'ehslu06@',
      dept_id: 1,
      position: 'Staff Manage Account TikTok',
      phone: '081234567803',
      salary_system: 'per_account',
      rate: 500,
      base_salary: 0,
      daily_target: 10,
      bonus: 0,
      period_start: 1,
      pay_date: '25'
    },
    {
      emp_id: 'EMP004',
      name: 'uzank',
      email: 'uzank@company.com',
      raw_password: 'ehszank06@',
      dept_id: 1,
      position: 'Staff Manage Account TikTok',
      phone: '081234567804',
      salary_system: 'per_account',
      rate: 500,
      base_salary: 0,
      daily_target: 10,
      bonus: 0,
      period_start: 1,
      pay_date: '25'
    },

    // --- DEPARTEMEN 2: Creating Multiple Accounts ---
    {
      emp_id: 'EMP005',
      name: 'Ilyas',
      email: 'ilyas@company.com',
      raw_password: 'ehsyas06@',
      dept_id: 2,
      position: 'Staff Creating Multiple Accounts',
      phone: '081234567805',
      salary_system: 'per_account',
      rate: 4000,
      base_salary: 1200000,
      daily_target: 10,
      bonus: 0,
      period_start: 4,
      pay_date: '4'
    },
    {
      emp_id: 'EMP006',
      name: 'Silvi',
      email: 'silvi@company.com',
      raw_password: 'ehsvia06@',
      dept_id: 2,
      position: 'Staff Creating Multiple Accounts',
      phone: '081234567806',
      salary_system: 'per_account',
      rate: 4200,
      base_salary: 1200000,
      daily_target: 10,
      bonus: 0,
      period_start: 12,
      pay_date: '25'
    },
    {
      emp_id: 'EMP007',
      name: 'Nana',
      email: 'nana@company.com',
      raw_password: 'ehsna06@',
      dept_id: 2,
      position: 'Staff Creating Multiple Accounts',
      phone: '081234567807',
      salary_system: 'per_account',
      rate: 4600,
      base_salary: 600000,
      daily_target: 5,
      bonus: 0,
      period_start: 12,
      pay_date: '12'
    },
    {
      emp_id: 'EMP008',
      name: 'Arum',
      email: 'arum@company.com',
      raw_password: 'ehsrum06@',
      dept_id: 2,
      position: 'Staff Creating Multiple Accounts',
      phone: '081234567808',
      salary_system: 'per_account',
      rate: 4600,
      base_salary: 600000,
      daily_target: 5,
      bonus: 0,
      period_start: 15,
      pay_date: '15'
    },
    {
      emp_id: 'EMP009',
      name: 'Sinta',
      email: 'sinta@company.com',
      raw_password: 'ehssin06@',
      dept_id: 2,
      position: 'Staff Creating Multiple Accounts',
      phone: '081234567809',
      salary_system: 'per_account',
      rate: 4600,
      base_salary: 600000,
      daily_target: 5,
      bonus: 0,
      period_start: 15,
      pay_date: '15'
    },

    // --- DEPARTEMEN 3: Video Production ---
    {
      emp_id: 'EMP010',
      name: 'Sipa',
      email: 'sipa@company.com',
      raw_password: 'ehspa06@',
      dept_id: 3,
      position: 'Staff Video Production TikTok',
      phone: '081234567810',
      salary_system: 'per_account',
      rate: 33000,
      base_salary: 600000,
      daily_target: 5,
      bonus: 0,
      period_start: 13,
      pay_date: '13'
    }
  ];

  // Hapus akun demo bawaan lama agar tidak membingungkan (Budi, Siti, dll)
  try {
    const demoEmails = ['budi@company.com', 'siti@company.com', 'ahmad@company.com', 'dewi@company.com', 'rizky@company.com'];
    demoEmails.forEach(dem => {
      db.prepare('DELETE FROM users WHERE email = ?').run(dem);
    });
  } catch (e) {}

  employeesData.forEach(emp => {
    try {
      const passwordHash = bcrypt.hashSync(emp.raw_password, 10);
      const existing = db.prepare('SELECT id FROM users WHERE email = ? OR LOWER(name) = LOWER(?) OR employee_id = ?').get(emp.email, emp.name, emp.emp_id);

      if (existing) {
        db.prepare(`
          UPDATE users 
          SET employee_id = ?, name = ?, email = ?, password_hash = ?, role = 'employee',
              department_id = ?, position = ?, phone = ?, salary_system = ?, rate_per_account = ?,
              base_salary = ?, daily_target = ?, target_bonus = ?, payroll_period = 'bulanan',
              period_start_day = ?, pay_date = ?, is_active = 1
          WHERE id = ?
        `).run(
          emp.emp_id, emp.name, emp.email, passwordHash,
          emp.dept_id, emp.position, emp.phone, emp.salary_system, emp.rate,
          emp.base_salary, emp.daily_target, emp.bonus,
          emp.period_start, emp.pay_date, existing.id
        );
      } else {
        db.prepare(`
          INSERT INTO users (
            employee_id, name, email, password_hash, role,
            department_id, position, phone, salary_system, rate_per_account,
            base_salary, daily_target, target_bonus, payroll_period,
            period_start_day, pay_date, is_active
          ) VALUES (?, ?, ?, ?, 'employee', ?, ?, ?, ?, ?, ?, ?, ?, 'bulanan', ?, ?, 1)
        `).run(
          emp.emp_id, emp.name, emp.email, passwordHash,
          emp.dept_id, emp.position, emp.phone, emp.salary_system, emp.rate,
          emp.base_salary, emp.daily_target, emp.bonus,
          emp.period_start, emp.pay_date
        );
      }
    } catch (e) {
      console.warn('Seed employee error for ' + emp.name + ':', e.message);
    }
  });

  // Ensure default salary and earnings for all existing users and attendances
  try {
    db.prepare('UPDATE users SET salary_system = "per_account" WHERE salary_system IS NULL').run();
    db.prepare('UPDATE users SET rate_per_account = 500 WHERE rate_per_account IS NULL OR rate_per_account = 0').run();
    db.prepare('UPDATE attendance SET rate_per_account = 500 WHERE rate_per_account IS NULL OR rate_per_account = 0').run();
    db.prepare('UPDATE attendance SET daily_earnings = accounts_created * rate_per_account WHERE daily_earnings IS NULL OR daily_earnings = 0').run();
    db.prepare('UPDATE attendance SET payment_status = "unpaid" WHERE payment_status IS NULL').run();
    db.prepare('UPDATE attendance SET approval_status = "approved" WHERE approval_status IS NULL').run();
  } catch (e) {
    console.warn('Salary backfill note:', e.message);
  }

  console.log('✅ 3 Official Departments & 10 Official Employees seeded successfully!');
}

module.exports = { seed };
