-- ========================================================
-- SCHEMA ABSENKU (SISTEM ABSENSI KARYAWAN & TOKO DIGITAL)
-- SUPABASE POSTGRESQL MIGRATION & SEED SCRIPT
-- ========================================================

-- 1. Buat Tabel Departemen
CREATE TABLE IF NOT EXISTS departments (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Buat Tabel Users / Karyawan
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  employee_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT DEFAULT 'employee',
  department_id INTEGER REFERENCES departments(id) ON DELETE SET NULL,
  position TEXT,
  phone TEXT,
  avatar TEXT,
  telegram_chat_id TEXT,
  telegram_username TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Buat Tabel Presensi / Absensi
CREATE TABLE IF NOT EXISTS attendance (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  clock_in TEXT,
  clock_out TEXT,
  clock_in_photo TEXT,
  clock_out_photo TEXT,
  clock_in_lat DOUBLE PRECISION,
  clock_in_lng DOUBLE PRECISION,
  clock_out_lat DOUBLE PRECISION,
  clock_out_lng DOUBLE PRECISION,
  status TEXT DEFAULT 'present',
  work_hours DOUBLE PRECISION,
  overtime_hours DOUBLE PRECISION DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, date)
);

-- 4. Buat Tabel Tugas / Tasks
CREATE TABLE IF NOT EXISTS tasks (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL,
  department_id INTEGER REFERENCES departments(id) ON DELETE SET NULL,
  created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  priority TEXT DEFAULT 'medium',
  status TEXT DEFAULT 'todo',
  deadline TEXT,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Buat Tabel Pengajuan Cuti / Izin
CREATE TABLE IF NOT EXISTS leave_requests (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  type TEXT NOT NULL,
  reason TEXT,
  status TEXT DEFAULT 'pending',
  approved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Buat Tabel Pengaturan / Settings
CREATE TABLE IF NOT EXISTS settings (
  id SERIAL PRIMARY KEY,
  key TEXT UNIQUE NOT NULL,
  value TEXT NOT NULL,
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Buat Tabel Shift Kerja
CREATE TABLE IF NOT EXISTS shifts (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  late_tolerance INTEGER DEFAULT 15,
  is_default INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. Buat Tabel Notifikasi
CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT DEFAULT 'info',
  is_read INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. Buat Tabel Bot Logs
CREATE TABLE IF NOT EXISTS bot_logs (
  id SERIAL PRIMARY KEY,
  type TEXT NOT NULL,
  target_user_id INTEGER,
  target_name TEXT,
  message TEXT,
  status TEXT DEFAULT 'success',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ========================================================
-- PERIZINAN SUPABASE REST API (DISABLE RLS AGAR ANON BISA AKSES)
-- ========================================================
ALTER TABLE departments DISABLE ROW LEVEL SECURITY;
ALTER TABLE users DISABLE ROW LEVEL SECURITY;
ALTER TABLE attendance DISABLE ROW LEVEL SECURITY;
ALTER TABLE tasks DISABLE ROW LEVEL SECURITY;
ALTER TABLE leave_requests DISABLE ROW LEVEL SECURITY;
ALTER TABLE settings DISABLE ROW LEVEL SECURITY;
ALTER TABLE shifts DISABLE ROW LEVEL SECURITY;
ALTER TABLE notifications DISABLE ROW LEVEL SECURITY;
ALTER TABLE bot_logs DISABLE ROW LEVEL SECURITY;

GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;

-- Helper RPC functions for dynamic queries
CREATE OR REPLACE FUNCTION exec_query(sql_query text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result json;
BEGIN
  EXECUTE 'SELECT json_agg(t) FROM (' || sql_query || ') as t' INTO result;
  RETURN coalesce(result, '[]'::json);
END;
$$;

CREATE OR REPLACE FUNCTION exec_command(sql_command text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  EXECUTE sql_command;
  RETURN json_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION exec_query(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION exec_command(text) TO anon, authenticated, service_role;


-- ========================================================
-- SEED DATA (DATA AWAL SISTEM)
-- ========================================================

-- Seed Departemen
INSERT INTO departments (id, name, description) VALUES
  (1, 'CS & Order', 'Layanan chat customer, transaksi order produk digital & akun TikTok'),
  (2, 'Konten & TikTok Creator', 'Produksi konten TikTok, riset video FYP, & template kreatif'),
  (3, 'Fulfillment & Akun Digital', 'QC akun TikTok, serah terima data login, kirim link/file produk digital'),
  (4, 'Host Live Streaming', 'Live streaming TikTok jualan akun & etalase produk digital'),
  (5, 'Digital Ads & Traffic', 'Pengelolaan iklan TikTok Ads, Meta Ads & traffic katalog produk')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description;

-- Seed Shifts
INSERT INTO shifts (id, name, start_time, end_time, late_tolerance, is_default) VALUES
  (1, 'Regular (Office & CS)', '08:00', '17:00', 15, 1),
  (2, 'Shift Siang (Content Creator)', '11:00', '19:00', 15, 0),
  (3, 'Shift Sore / Malam (Live Host TikTok)', '15:00', '23:00', 15, 0)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, start_time = EXCLUDED.start_time, end_time = EXCLUDED.end_time;

-- Seed Users (Password: admin123 untuk admin, karyawan123 untuk karyawan)
INSERT INTO users (id, employee_id, name, email, password_hash, role, department_id, position, phone, is_active) VALUES
  (1, 'ADM001', 'Administrator', 'admin@company.com', '$2a$10$SxWRQq6ep4izLyzkFSk3reHFkTJTporaEEld/vUA7IZMFfoYXH88y', 'admin', NULL, 'Owner / Head of Digital Store', '081234567890', 1),
  (2, 'EMP001', 'Budi Santoso', 'budi@company.com', '$2a$10$NBwhbOFmbbgUJ5YjagjwleKCZmGz9ixlznsSc/GZygDLyAxqK39.2', 'employee', 1, 'CS & Admin Order TikTok', '081234567891', 1),
  (3, 'EMP002', 'Siti Rahayu', 'siti@company.com', '$2a$10$NBwhbOFmbbgUJ5YjagjwleKCZmGz9ixlznsSc/GZygDLyAxqK39.2', 'employee', 2, 'TikTok Creator & Video Editor', '081234567892', 1),
  (4, 'EMP003', 'Ahmad Fauzi', 'ahmad@company.com', '$2a$10$NBwhbOFmbbgUJ5YjagjwleKCZmGz9ixlznsSc/GZygDLyAxqK39.2', 'employee', 3, 'Staff QC & Serah Terima Akun TikTok', '081234567893', 1),
  (5, 'EMP004', 'Dewi Lestari', 'dewi@company.com', '$2a$10$NBwhbOFmbbgUJ5YjagjwleKCZmGz9ixlznsSc/GZygDLyAxqK39.2', 'employee', 4, 'Host Live Streaming TikTok Shop', '081234567894', 1),
  (6, 'EMP005', 'Rizky Pratama', 'rizky@company.com', '$2a$10$cb7daPvxZU6YLjJ6izUHQe36gMO5ACbU7Y55frs0EJq/Sak91K4iu', 'employee', 5, 'TikTok Ads & Traffic Specialist', '081234567895', 1)
ON CONFLICT (id) DO UPDATE SET 
  name = EXCLUDED.name, 
  email = EXCLUDED.email, 
  password_hash = EXCLUDED.password_hash, 
  role = EXCLUDED.role, 
  department_id = EXCLUDED.department_id, 
  position = EXCLUDED.position;

-- Seed Settings
INSERT INTO settings (key, value, description) VALUES
  ('company_name', 'DigiStore - Produk Digital & Akun TikTok', 'Nama usaha / toko digital'),
  ('company_desc', 'Sistem operasional dan presensi tim jualan produk digital, akun TikTok, dan live streaming.', 'Deskripsi toko'),
  ('office_lat', '-6.2088', 'Latitude kantor'),
  ('office_lng', '106.8456', 'Longitude kantor'),
  ('office_radius', '200', 'Radius absen dari kantor (meter)'),
  ('work_start', '08:00', 'Jam mulai kerja'),
  ('work_end', '17:00', 'Jam selesai kerja'),
  ('late_tolerance', '15', 'Toleransi keterlambatan (menit)'),
  ('require_photo', 'false', 'Wajib foto saat absen'),
  ('gemini_api_key', '', 'Gemini API Key'),
  ('gemini_model', 'gemini-3.5-flash-lite', 'Model Gemini AI'),
  ('telegram_bot_token', '', 'Token Bot Telegram'),
  ('telegram_bot_username', '@botttabsenbot', 'Username Bot Telegram'),
  ('telegram_admin_chat_id', '7328677176', 'Admin Chat ID'),
  ('ai_auto_reminder_in', '0', 'Auto reminder masuk'),
  ('ai_auto_reminder_out', '0', 'Auto reminder pulang'),
  ('ai_auto_reminder_tasks', '0', 'Auto reminder tugas'),
  ('ai_daily_report', '0', 'Daily report aktif'),
  ('ai_daily_report_time', '17:30', 'Waktu report')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- Atur auto increment sequence
SELECT setval('departments_id_seq', (SELECT MAX(id) FROM departments));
SELECT setval('users_id_seq', (SELECT MAX(id) FROM users));
SELECT setval('shifts_id_seq', (SELECT MAX(id) FROM shifts));
