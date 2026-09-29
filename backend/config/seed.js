const bcrypt = require('bcryptjs');
const { dbHelper } = require('./database');

async function seed() {
  console.log('🌱 Seeding database for Digital Products & TikTok Accounts Business...\n');

  const db = dbHelper;

  // Default Settings for Digital Goods & TikTok Store
  const settings = [
    { key: 'company_name', value: 'DigiStore - Produk Digital & Akun TikTok', description: 'Nama usaha / toko digital' },
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
    } catch(e) {}
  });

  // Default Shifts
  const shifts = [
    ['Regular (Office & CS)', '08:00', '17:00', 15, 1],
    ['Shift Siang (Content Creator)', '11:00', '19:00', 15, 0],
    ['Shift Sore / Malam (Live Host TikTok)', '15:00', '23:00', 15, 0],
  ];
  shifts.forEach(s => {
    try {
      const exists = db.prepare('SELECT id FROM shifts WHERE name = ?').get(s[0]);
      if (!exists) {
        db.prepare('INSERT INTO shifts (name, start_time, end_time, late_tolerance, is_default) VALUES (?, ?, ?, ?, ?)').run(...s);
      }
    } catch(e) {}
  });

  // Departments for Digital Products & TikTok Business
  const depts = [
    ['CS & Order', 'Layanan chat customer, transaksi order produk digital & akun TikTok'],
    ['Konten & TikTok Creator', 'Produksi konten TikTok, riset video FYP, & template kreatif'],
    ['Fulfillment & Akun Digital', 'QC akun TikTok, serah terima data login, kirim link/file produk digital'],
    ['Host Live Streaming', 'Live streaming TikTok jualan akun & etalase produk digital'],
    ['Digital Ads & Traffic', 'Pengelolaan iklan TikTok Ads, Meta Ads & traffic katalog produk'],
  ];
  depts.forEach(d => {
    try {
      const exists = db.prepare('SELECT id FROM departments WHERE name = ?').get(d[0]);
      if (!exists) {
        db.prepare('INSERT INTO departments (name, description) VALUES (?, ?)').run(...d);
      }
    } catch(e) {}
  });

  // Admin User
  const adminPassword = bcrypt.hashSync('admin123', 10);
  try {
    const adminExists = db.prepare('SELECT id FROM users WHERE email = ?').get('admin@company.com');
    if (!adminExists) {
      db.prepare('INSERT INTO users (employee_id, name, email, password_hash, role, department_id, position, phone, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)')
        .run('ADM001', 'Administrator', 'admin@company.com', adminPassword, 'admin', null, 'Owner / Head of Digital Store', '081234567890');
    }
  } catch(e) {}

  // Employees for Digital Products & TikTok Store
  const empPassword = bcrypt.hashSync('karyawan123', 10);
  const deptMap = {};
  db.prepare('SELECT id, name FROM departments').all().forEach(d => { deptMap[d.name] = d.id; });

  const employees = [
    ['EMP001', 'Budi Santoso', 'budi@company.com', empPassword, 'employee', deptMap['CS & Order'] || 1, 'CS & Admin Order TikTok', '081234567891'],
    ['EMP002', 'Siti Rahayu', 'siti@company.com', empPassword, 'employee', deptMap['Konten & TikTok Creator'] || 2, 'TikTok Creator & Video Editor', '081234567892'],
    ['EMP003', 'Ahmad Fauzi', 'ahmad@company.com', empPassword, 'employee', deptMap['Fulfillment & Akun Digital'] || 3, 'Staff QC & Serah Terima Akun TikTok', '081234567893'],
    ['EMP004', 'Dewi Lestari', 'dewi@company.com', empPassword, 'employee', deptMap['Host Live Streaming'] || 4, 'Host Live Streaming TikTok Shop', '081234567894'],
    ['EMP005', 'Rizky Pratama', 'rizky@company.com', empPassword, 'employee', deptMap['Digital Ads & Traffic'] || 5, 'TikTok Ads & Traffic Specialist', '081234567895'],
  ];

  employees.forEach(emp => {
    try {
      const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(emp[2]);
      if (!exists) {
        db.prepare('INSERT INTO users (employee_id, name, email, password_hash, role, department_id, position, phone, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)').run(...emp);
      }
    } catch(e) {}
  });

  // Sample tasks for Digital Products & TikTok Store
  const budi = db.prepare('SELECT id FROM users WHERE email = ?').get('budi@company.com');
  const siti = db.prepare('SELECT id FROM users WHERE email = ?').get('siti@company.com');
  const ahmad = db.prepare('SELECT id FROM users WHERE email = ?').get('ahmad@company.com');
  const dewi = db.prepare('SELECT id FROM users WHERE email = ?').get('dewi@company.com');
  const rizky = db.prepare('SELECT id FROM users WHERE email = ?').get('rizky@company.com');
  const admin = db.prepare('SELECT id FROM users WHERE email = ?').get('admin@company.com');

  const adminId = admin ? admin.id : 1;

  const tasks = [
    ['QC & Verifikasi 20 Akun TikTok Siap Jual', 'Cek follower organik, email pertama, bebas pelanggaran, akun siap transfer ke pembeli', ahmad ? ahmad.id : 4, deptMap['Fulfillment & Akun Digital'] || 3, adminId, 'urgent', 'in_progress', '2026-10-02'],
    ['Riset 5 Sound FYP & Upload 3 Video TikTok Produk Digital', 'Video promosi template digital & showcase akun TikTok bergaransi', siti ? siti.id : 3, deptMap['Konten & TikTok Creator'] || 2, adminId, 'high', 'in_progress', '2026-10-03'],
    ['Proses Pengiriman Kredensial & File 12 Pesanan Hari Ini', 'Kirim detail login akun TikTok & link produk digital ke pembeli via WA', ahmad ? ahmad.id : 4, deptMap['Fulfillment & Akun Digital'] || 3, adminId, 'urgent', 'todo', '2026-10-01'],
    ['Live Streaming Jualan Akun & Produk Digital (Shift Sore 16.00)', 'Target live 3 jam, promo diskon bundling akun siap live streaming', dewi ? dewi.id : 5, deptMap['Host Live Streaming'] || 4, adminId, 'high', 'todo', '2026-10-01'],
    ['Rekap Penjualan Akun & Broadcast Promo ke Database WA/Telegram', 'Broadcast promo akun monet & produk digital ke reseller/pelanggan setia', budi ? budi.id : 2, deptMap['CS & Order'] || 1, adminId, 'medium', 'done', '2026-10-01'],
    ['Optimasi Campaign TikTok Ads Produk Digital & Scale Up Budget', 'Cek ROAS campaign ebook & template digital, matikan ad set boncos', rizky ? rizky.id : 6, deptMap['Digital Ads & Traffic'] || 5, adminId, 'medium', 'in_progress', '2026-10-05'],
  ];

  tasks.forEach(t => {
    try {
      const exists = db.prepare('SELECT id FROM tasks WHERE title = ?').get(t[0]);
      if (!exists) {
        db.prepare('INSERT INTO tasks (title, description, assigned_to, department_id, created_by, priority, status, deadline) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(...t);
      }
    } catch(e) {}
  });

  // Sample attendance
  const today = new Date().toISOString().split('T')[0];
  const attendances = [
    [budi ? budi.id : 2, today, '07:55', 'present'],
    [siti ? siti.id : 3, today, '08:20', 'late'],
    [ahmad ? ahmad.id : 4, today, '07:50', 'present'],
  ];
  attendances.forEach(a => {
    try {
      db.prepare('INSERT INTO attendance (user_id, date, clock_in, status) VALUES (?, ?, ?, ?)').run(...a);
    } catch(e) {}
  });

  console.log('✅ Seed updated successfully for Digital Goods & TikTok Store!');
}

module.exports = { seed };
