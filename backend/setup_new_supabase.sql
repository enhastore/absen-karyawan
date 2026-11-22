-- 1. DEPARTMENTS
CREATE TABLE IF NOT EXISTS departments (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
INSERT INTO departments (id, name, description) VALUES (1, 'Manage Account', 'Pengelolaan dan pemeliharaan akun TikTok secara berkala untuk mempersiapkan akun agar memenuhi persyaratan aktivasi TikTok Shop Affiliate.') ON CONFLICT (id) DO NOTHING;
INSERT INTO departments (id, name, description) VALUES (2, 'Creating Multiple Accounts', 'Membuat dan menyiapkan akun TikTok dalam jumlah banyak setiap harinya sesuai target produksi yang telah ditentukan.') ON CONFLICT (id) DO NOTHING;
INSERT INTO departments (id, name, description) VALUES (3, 'Video Production', 'Memproduksi dan merekam video sebagai bahan konten untuk kebutuhan operasional ternak TikTok.') ON CONFLICT (id) DO NOTHING;
SELECT setval(pg_get_serial_sequence('departments', 'id'), COALESCE((SELECT MAX(id) FROM departments), 1));

-- 2. USERS
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  employee_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT DEFAULT 'employee',
  department_id INTEGER REFERENCES departments(id),
  position TEXT,
  phone TEXT,
  avatar TEXT,
  salary_system TEXT DEFAULT 'per_account',
  rate_per_account INTEGER DEFAULT 500,
  base_salary INTEGER DEFAULT 0,
  daily_target INTEGER DEFAULT 0,
  target_bonus INTEGER DEFAULT 0,
  payroll_period TEXT DEFAULT 'bulanan',
  period_start_day INTEGER DEFAULT 1,
  pay_date TEXT DEFAULT '25',
  is_active INTEGER DEFAULT 1,
  telegram_chat_id TEXT,
  telegram_username TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
INSERT INTO users (id, employee_id, name, email, password_hash, role, department_id, position, phone, avatar, salary_system, rate_per_account, base_salary, daily_target, target_bonus, payroll_period, period_start_day, pay_date, is_active)
VALUES (1, 'ADM001', 'Administrator', 'admin@company.com', '$2a$10$SxWRQq6ep4izLyzkFSk3reHFkTJTporaEEld/vUA7IZMFfoYXH88y', 'admin', NULL, 'Owner / Head of Digital Store', '081234567890', NULL, 'per_account', 500, 0, 0, 0, 'bulanan', 1, '25', 1)
ON CONFLICT (id) DO NOTHING;
INSERT INTO users (id, employee_id, name, email, password_hash, role, department_id, position, phone, avatar, salary_system, rate_per_account, base_salary, daily_target, target_bonus, payroll_period, period_start_day, pay_date, is_active)
VALUES (14, 'EMP001', 'Naila', 'naila@company.com', '$2a$10$kj09emiaOG58CPjRnHrOHeuefkzJdILqnKt/HAXpZHTfr/9E9AaKy', 'employee', 1, 'Staff Manage Account TikTok', '081234567801', NULL, 'per_account', 500, 0, 10, 0, 'bulanan', 1, '25', 1)
ON CONFLICT (id) DO NOTHING;
INSERT INTO users (id, employee_id, name, email, password_hash, role, department_id, position, phone, avatar, salary_system, rate_per_account, base_salary, daily_target, target_bonus, payroll_period, period_start_day, pay_date, is_active)
VALUES (15, 'EMP002', 'Salwa', 'salwa@company.com', '$2a$10$hZyov5yxWRCHY0HwvrSrJOugdzteKV1tBciWCnbO0VvKohndZCso2', 'employee', 1, 'Staff Manage Account TikTok', '081234567802', NULL, 'per_account', 500, 0, 10, 0, 'bulanan', 1, '25', 1)
ON CONFLICT (id) DO NOTHING;
INSERT INTO users (id, employee_id, name, email, password_hash, role, department_id, position, phone, avatar, salary_system, rate_per_account, base_salary, daily_target, target_bonus, payroll_period, period_start_day, pay_date, is_active)
VALUES (16, 'EMP003', 'Lulu', 'lulu@company.com', '$2a$10$rOq.Zr2ukvSGxL9BZ/LZIORDTXWS36iGi5qlEU.YqZwzCh3RxwcO6', 'employee', 1, 'Staff Manage Account TikTok', '081234567803', NULL, 'per_account', 500, 0, 10, 0, 'bulanan', 1, '25', 1)
ON CONFLICT (id) DO NOTHING;
INSERT INTO users (id, employee_id, name, email, password_hash, role, department_id, position, phone, avatar, salary_system, rate_per_account, base_salary, daily_target, target_bonus, payroll_period, period_start_day, pay_date, is_active)
VALUES (17, 'EMP004', 'uzank', 'uzank@company.com', '$2a$10$ZnM4fVtbdBm7id3p3vGk9OEx9VYOKVg2yffAugryV9vIaL8Gb2jrm', 'employee', 1, 'Staff Manage Account TikTok', '081234567804', NULL, 'per_account', 500, 0, 10, 0, 'bulanan', 1, '25', 1)
ON CONFLICT (id) DO NOTHING;
INSERT INTO users (id, employee_id, name, email, password_hash, role, department_id, position, phone, avatar, salary_system, rate_per_account, base_salary, daily_target, target_bonus, payroll_period, period_start_day, pay_date, is_active)
VALUES (18, 'EMP005', 'Ilyas', 'ilyas@company.com', '$2a$10$4A9NjDQ3f4ql6eg1F5D9WeMjnzUidENJ55.t0owKkPyxVMUeBjx6O', 'employee', 2, 'Staff Creating Multiple Accounts', '081234567805', NULL, 'per_account', 4000, 1200000, 10, 0, 'bulanan', 4, '4', 1)
ON CONFLICT (id) DO NOTHING;
INSERT INTO users (id, employee_id, name, email, password_hash, role, department_id, position, phone, avatar, salary_system, rate_per_account, base_salary, daily_target, target_bonus, payroll_period, period_start_day, pay_date, is_active)
VALUES (19, 'EMP006', 'Silvi', 'silvi@company.com', '$2a$10$EUzS5ezsn5Gc9lRI5ofxu.KtfIRtMmFJkjB17JNRBsPH5VIR2IDQu', 'employee', 2, 'Staff Creating Multiple Accounts', '081234567806', NULL, 'per_account', 4200, 1200000, 10, 0, 'bulanan', 12, '25', 1)
ON CONFLICT (id) DO NOTHING;
INSERT INTO users (id, employee_id, name, email, password_hash, role, department_id, position, phone, avatar, salary_system, rate_per_account, base_salary, daily_target, target_bonus, payroll_period, period_start_day, pay_date, is_active)
VALUES (20, 'EMP007', 'Nana', 'nana@company.com', '$2a$10$sLdTJvWoT1W3mM.D2IJIPe5N/EFkJ10ItSGhopiiLCmbOelW3kL12', 'employee', 2, 'Staff Creating Multiple Accounts', '081234567807', NULL, 'per_account', 4600, 600000, 5, 0, 'bulanan', 12, '12', 1)
ON CONFLICT (id) DO NOTHING;
INSERT INTO users (id, employee_id, name, email, password_hash, role, department_id, position, phone, avatar, salary_system, rate_per_account, base_salary, daily_target, target_bonus, payroll_period, period_start_day, pay_date, is_active)
VALUES (21, 'EMP008', 'Arum', 'arum@company.com', '$2a$10$herhcB7zhdgoIXJ0bU/oO.AFLoyOCDCeDiRzZa0fuCSalt7Y8q50O', 'employee', 2, 'Staff Creating Multiple Accounts', '081234567808', NULL, 'per_account', 4600, 600000, 5, 0, 'bulanan', 15, '15', 1)
ON CONFLICT (id) DO NOTHING;
INSERT INTO users (id, employee_id, name, email, password_hash, role, department_id, position, phone, avatar, salary_system, rate_per_account, base_salary, daily_target, target_bonus, payroll_period, period_start_day, pay_date, is_active)
VALUES (22, 'EMP009', 'Sinta', 'sinta@company.com', '$2a$10$8UVKhahfErJJfGqPSlRx3eqjBvIk5AbxSSivsqcJwXTrhve/HOGSm', 'employee', 2, 'Staff Creating Multiple Accounts', '081234567809', NULL, 'per_account', 4600, 600000, 5, 0, 'bulanan', 15, '15', 1)
ON CONFLICT (id) DO NOTHING;
INSERT INTO users (id, employee_id, name, email, password_hash, role, department_id, position, phone, avatar, salary_system, rate_per_account, base_salary, daily_target, target_bonus, payroll_period, period_start_day, pay_date, is_active)
VALUES (23, 'EMP010', 'Sipa', 'sipa@company.com', '$2a$10$FhLXr3D9Xm4kmE6pZu9PPOJbBCwjWFicGWe.aYZRQtLmm7UWvBqSy', 'employee', 3, 'Staff Video Production TikTok', '081234567810', NULL, 'per_account', 33000, 600000, 5, 0, 'bulanan', 13, '13', 1)
ON CONFLICT (id) DO NOTHING;
SELECT setval(pg_get_serial_sequence('users', 'id'), COALESCE((SELECT MAX(id) FROM users), 1));

-- 3. ATTENDANCE
CREATE TABLE IF NOT EXISTS attendance (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  date TEXT NOT NULL,
  clock_in TEXT,
  clock_out TEXT,
  clock_in_photo TEXT,
  clock_out_photo TEXT,
  clock_in_lat REAL,
  clock_in_lng REAL,
  clock_out_lat REAL,
  clock_out_lng REAL,
  status TEXT DEFAULT 'present',
  work_hours REAL,
  overtime_hours REAL DEFAULT 0,
  accounts_created INTEGER DEFAULT 0,
  rate_per_account INTEGER DEFAULT 500,
  daily_earnings INTEGER DEFAULT 0,
  payment_status TEXT DEFAULT 'unpaid',
  approval_status TEXT DEFAULT 'approved',
  work_report TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, date)
);

-- 4. OTHER TABLES
CREATE TABLE IF NOT EXISTS tasks (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  assigned_to INTEGER REFERENCES users(id),
  department_id INTEGER REFERENCES departments(id),
  created_by INTEGER NOT NULL REFERENCES users(id),
  priority TEXT DEFAULT 'medium',
  status TEXT DEFAULT 'todo',
  deadline TEXT,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS leave_requests (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  type TEXT DEFAULT 'leave',
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  reason TEXT NOT NULL,
  attachment TEXT,
  status TEXT DEFAULT 'pending',
  admin_notes TEXT,
  reviewed_by INTEGER REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS shifts (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  is_night_shift INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT DEFAULT 'info',
  is_read INTEGER DEFAULT 0,
  link TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bot_logs (
  id SERIAL PRIMARY KEY,
  platform TEXT NOT NULL,
  chat_id TEXT,
  username TEXT,
  action TEXT NOT NULL,
  status TEXT DEFAULT 'success',
  message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS employee_notes (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  author_id INTEGER REFERENCES users(id),
  author_name TEXT,
  note TEXT NOT NULL,
  category TEXT DEFAULT 'general',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. RPC FUNCTIONS FOR BACKEND
CREATE OR REPLACE FUNCTION public.exec_command(sql_command text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  EXECUTE sql_command;
  RETURN json_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION public.exec_query(sql_query text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result json;
BEGIN
  EXECUTE 'SELECT COALESCE(json_agg(row_to_json(t)), ''[]''::json) FROM (' || sql_query || ') t' INTO result;
  RETURN result;
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('error', SQLERRM);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.exec_command(text) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.exec_query(text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.exec_command(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.exec_query(text) TO service_role;

-- 6. ENABLE ROW LEVEL SECURITY (RLS) ON ALL TABLES
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_notes ENABLE ROW LEVEL SECURITY;
