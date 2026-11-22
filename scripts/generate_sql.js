const initSqlJs = require('../backend/node_modules/sql.js');
const fs = require('fs');
const path = require('path');

async function generateSql() {
  const SQL = await initSqlJs();
  const dbPath = path.join(__dirname, '..', 'backend', 'database.sqlite');
  const db = new SQL.Database(fs.readFileSync(dbPath));

  let out = "";
  out += "-- 1. DEPARTMENTS\n";
  out += `CREATE TABLE IF NOT EXISTS departments (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);\n`;

  const depts = db.exec("SELECT id, name, description FROM departments WHERE id IN (1, 2, 3)");
  for (const row of depts[0].values) {
    out += `INSERT INTO departments (id, name, description) VALUES (${row[0]}, '${row[1].replace(/'/g, "''")}', '${(row[2]||"").replace(/'/g, "''")}') ON CONFLICT (id) DO NOTHING;\n`;
  }
  out += `SELECT setval(pg_get_serial_sequence('departments', 'id'), COALESCE((SELECT MAX(id) FROM departments), 1));\n\n`;

  out += "-- 2. USERS\n";
  out += `CREATE TABLE IF NOT EXISTS users (
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
);\n`;

  const users = db.exec("SELECT id, employee_id, name, email, password_hash, role, department_id, position, phone, avatar, salary_system, rate_per_account, base_salary, daily_target, target_bonus, payroll_period, period_start_day, pay_date, is_active FROM users ORDER BY id");
  for (const u of users[0].values) {
    const deptVal = (u[6] && [1,2,3].includes(u[6])) ? u[6] : "NULL";
    out += `INSERT INTO users (id, employee_id, name, email, password_hash, role, department_id, position, phone, avatar, salary_system, rate_per_account, base_salary, daily_target, target_bonus, payroll_period, period_start_day, pay_date, is_active)
VALUES (${u[0]}, '${u[1]}', '${u[2].replace(/'/g, "''")}', '${u[3]}', '${u[4]}', '${u[5]}', ${deptVal}, '${(u[7]||"").replace(/'/g, "''")}', '${u[8]||""}', ${u[9] ? `'${u[9]}'` : "NULL"}, '${u[10]||"per_account"}', ${u[11]||500}, ${u[12]||0}, ${u[13]||0}, ${u[14]||0}, '${u[15]||"bulanan"}', ${u[16]||1}, '${u[17]||"25"}', ${u[18]||1})
ON CONFLICT (id) DO NOTHING;\n`;
  }
  out += `SELECT setval(pg_get_serial_sequence('users', 'id'), COALESCE((SELECT MAX(id) FROM users), 1));\n\n`;

  out += "-- 3. ATTENDANCE\n";
  out += `CREATE TABLE IF NOT EXISTS attendance (
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
);\n\n`;

  out += "-- 4. OTHER TABLES\n";
  out += `CREATE TABLE IF NOT EXISTS tasks (
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
);\n\n`;

  out += "-- 5. RPC FUNCTIONS FOR BACKEND\n";
  out += `CREATE OR REPLACE FUNCTION public.exec_command(sql_command text)
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
GRANT EXECUTE ON FUNCTION public.exec_query(text) TO service_role;\n\n`;

  out += "-- 6. ENABLE ROW LEVEL SECURITY (RLS) ON ALL TABLES\n";
  out += `ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_notes ENABLE ROW LEVEL SECURITY;\n`;

  const targetPath = path.join(__dirname, '..', 'backend', 'setup_new_supabase.sql');
  fs.writeFileSync(targetPath, out);
  console.log("SQL generated at:", targetPath, "Size:", out.length, "bytes");
}

generateSql();
