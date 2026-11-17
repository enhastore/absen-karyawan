const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const { supabase } = require('./supabase');

const isVercel = !!process.env.VERCEL;
const localDbPath = path.join(__dirname, '..', 'database.sqlite');
const tmpDbPath = path.join('/tmp', 'database.sqlite');
const dbPath = isVercel ? tmpDbPath : localDbPath;

let db = null;

// Initialize database
async function initDatabase() {
  if (db) return db;

  try {
    let wasmBinary = null;
    const localWasm = path.join(__dirname, 'sql-wasm.wasm');
    const nodeModulesWasm = path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');

    if (fs.existsSync(localWasm)) {
      wasmBinary = fs.readFileSync(localWasm);
    } else if (fs.existsSync(nodeModulesWasm)) {
      wasmBinary = fs.readFileSync(nodeModulesWasm);
    }

    const SQL = await initSqlJs(wasmBinary ? { wasmBinary } : {});
    
    let fileBuffer = null;

    // 1. Try to download the latest persistent database from Supabase Storage
    if (supabase) {
      try {
        const { data: downloadData, error: dErr } = await supabase.storage
          .from('absenku_data')
          .download('database.sqlite');
        if (downloadData && !dErr) {
          const ab = await downloadData.arrayBuffer();
          fileBuffer = Buffer.from(ab);
          console.log('☁️ Loaded persistent database from Supabase Storage (' + fileBuffer.length + ' bytes)');
          if (isVercel) {
            try { fs.writeFileSync(tmpDbPath, fileBuffer); } catch(e) {}
          }
        } else if (dErr) {
          console.warn('Notice from Supabase Storage download:', dErr.message);
        }
      } catch (err) {
        console.warn('Supabase Storage load note:', err.message);
      }
    }

    // 2. Fallback to /tmp or local database.sqlite
    if (!fileBuffer) {
      if (isVercel && !fs.existsSync(tmpDbPath) && fs.existsSync(localDbPath)) {
        try {
          fs.copyFileSync(localDbPath, tmpDbPath);
        } catch (e) {}
      }

      if (fs.existsSync(dbPath)) {
        fileBuffer = fs.readFileSync(dbPath);
      }
    }

    if (fileBuffer) {
      db = new SQL.Database(fileBuffer);
    } else {
      db = new SQL.Database();
    }
  } catch (err) {
    console.warn('⚠️ SQL.js init note:', err.message);
    return null;
  }

  // Create tables
  db.run(`
    CREATE TABLE IF NOT EXISTS departments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT DEFAULT 'employee',
      department_id INTEGER,
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
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (department_id) REFERENCES departments(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS attendance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
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
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      UNIQUE(user_id, date)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      assigned_to INTEGER,
      department_id INTEGER,
      created_by INTEGER NOT NULL,
      priority TEXT DEFAULT 'medium',
      status TEXT DEFAULT 'todo',
      deadline TEXT,
      completed_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (assigned_to) REFERENCES users(id),
      FOREIGN KEY (department_id) REFERENCES departments(id),
      FOREIGN KEY (created_by) REFERENCES users(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS leave_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      type TEXT NOT NULL,
      reason TEXT,
      status TEXT DEFAULT 'pending',
      approved_by INTEGER,
      approved_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (approved_by) REFERENCES users(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT UNIQUE NOT NULL,
      value TEXT NOT NULL,
      description TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS shifts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      late_tolerance INTEGER DEFAULT 15,
      is_default INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      type TEXT DEFAULT 'info',
      is_read INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS bot_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      target_user_id INTEGER,
      target_name TEXT,
      message TEXT,
      status TEXT DEFAULT 'success',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS employee_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      author_id INTEGER,
      author_name TEXT,
      note TEXT NOT NULL,
      category TEXT DEFAULT 'general',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (author_id) REFERENCES users(id)
    )
  `);

  try {
    const tableInfo = db.exec("PRAGMA table_info(users)");
    const cols = tableInfo.length > 0 ? tableInfo[0].values.map(v => v[1]) : [];
    if (!cols.includes('telegram_chat_id')) {
      db.run("ALTER TABLE users ADD COLUMN telegram_chat_id TEXT");
    }
    if (!cols.includes('telegram_username')) {
      db.run("ALTER TABLE users ADD COLUMN telegram_username TEXT");
    }
    if (!cols.includes('salary_system')) {
      db.run("ALTER TABLE users ADD COLUMN salary_system TEXT DEFAULT 'per_account'");
    }
    if (!cols.includes('rate_per_account')) {
      db.run("ALTER TABLE users ADD COLUMN rate_per_account INTEGER DEFAULT 500");
    }
    if (!cols.includes('base_salary')) {
      db.run("ALTER TABLE users ADD COLUMN base_salary INTEGER DEFAULT 0");
    }
    if (!cols.includes('daily_target')) {
      db.run("ALTER TABLE users ADD COLUMN daily_target INTEGER DEFAULT 0");
    }
    if (!cols.includes('target_bonus')) {
      db.run("ALTER TABLE users ADD COLUMN target_bonus INTEGER DEFAULT 0");
    }
    if (!cols.includes('payroll_period')) {
      db.run("ALTER TABLE users ADD COLUMN payroll_period TEXT DEFAULT 'bulanan'");
    }
    if (!cols.includes('period_start_day')) {
      db.run("ALTER TABLE users ADD COLUMN period_start_day INTEGER DEFAULT 1");
    }
    if (!cols.includes('pay_date')) {
      db.run("ALTER TABLE users ADD COLUMN pay_date TEXT DEFAULT '25'");
    }
  } catch(e) {
    console.warn("Notice checking telegram and salary columns:", e.message);
  }

  try {
    const attInfo = db.exec("PRAGMA table_info(attendance)");
    const attCols = attInfo.length > 0 ? attInfo[0].values.map(v => v[1]) : [];
    if (!attCols.includes('accounts_created')) {
      db.run("ALTER TABLE attendance ADD COLUMN accounts_created INTEGER DEFAULT 0");
    }
    if (!attCols.includes('work_report')) {
      db.run("ALTER TABLE attendance ADD COLUMN work_report TEXT");
    }
    if (!attCols.includes('rate_per_account')) {
      db.run("ALTER TABLE attendance ADD COLUMN rate_per_account INTEGER DEFAULT 500");
    }
    if (!attCols.includes('daily_earnings')) {
      db.run("ALTER TABLE attendance ADD COLUMN daily_earnings INTEGER DEFAULT 0");
    }
    if (!attCols.includes('payment_status')) {
      db.run("ALTER TABLE attendance ADD COLUMN payment_status TEXT DEFAULT 'unpaid'");
    }
    if (!attCols.includes('approval_status')) {
      db.run("ALTER TABLE attendance ADD COLUMN approval_status TEXT DEFAULT 'approved'");
    }
  } catch(e) {
    console.warn("Notice checking attendance columns:", e.message);
  }

  saveDatabase();
  return db;
}

// Sync database to Supabase Storage
let isSyncing = false;
let pendingSync = false;

async function doUploadToSupabase() {
  if (!supabase || !db) return;
  try {
    const data = db.export();
    const buffer = Buffer.from(data);
    const { error } = await supabase.storage
      .from('absenku_data')
      .upload('database.sqlite', buffer, {
        contentType: 'application/x-sqlite3',
        upsert: true
      });
    if (error) {
      console.warn('Supabase storage upload note:', error.message);
    } else {
      console.log('☁️ Database successfully persisted to Supabase Storage (' + buffer.length + ' bytes)');
    }
  } catch (err) {
    console.warn('Supabase storage upload error:', err.message);
  }
}

async function syncToSupabaseStorage() {
  if (isSyncing) {
    pendingSync = true;
    return;
  }
  isSyncing = true;
  pendingSync = false;
  await doUploadToSupabase();
  isSyncing = false;
  if (pendingSync) {
    pendingSync = false;
    setTimeout(syncToSupabaseStorage, 300);
  }
}

// Save database to file and sync to cloud
function saveDatabase() {
  if (db) {
    try {
      const data = db.export();
      const buffer = Buffer.from(data);
      fs.writeFileSync(dbPath, buffer);
    } catch (e) {
      console.warn('saveDatabase warning:', e.message);
    }

    if (supabase) {
      syncToSupabaseStorage();
    }
  }
}

// Explicit awaitable save for critical routes (clock-in, clock-out)
async function saveDatabaseAsync() {
  if (db) {
    try {
      const data = db.export();
      const buffer = Buffer.from(data);
      fs.writeFileSync(dbPath, buffer);
    } catch (e) {}

    if (supabase) {
      isSyncing = true;
      await doUploadToSupabase();
      isSyncing = false;
    }
  }
}

// Auto-save every 30 seconds (only in non-serverless environments)
if (!isVercel) {
  setInterval(saveDatabase, 30000);
  process.on('exit', saveDatabase);
  process.on('SIGINT', () => { saveDatabase(); process.exit(); });
  process.on('SIGTERM', () => { saveDatabase(); process.exit(); });
}

// Helper functions to match better-sqlite3-like API
function getDb() {
  return db;
}

// Wrapper for prepare-like syntax
const dbHelper = {
  prepare(sql) {
    if (!db) {
      return {
        run: () => ({ lastInsertRowid: 0, changes: 0 }),
        get: () => undefined,
        all: () => []
      };
    }
    return {
      run(...params) {
        if (!db) return { lastInsertRowid: 0, changes: 0 };
        db.run(sql, params);
        saveDatabase();
        const result = db.exec("SELECT last_insert_rowid() as id");
        return { 
          lastInsertRowid: result.length > 0 ? result[0].values[0][0] : 0,
          changes: db.getRowsModified()
        };
      },
      get(...params) {
        if (!db) return undefined;
        const stmt = db.prepare(sql);
        stmt.bind(params);
        if (stmt.step()) {
          const cols = stmt.getColumnNames();
          const vals = stmt.get();
          stmt.free();
          const row = {};
          cols.forEach((col, i) => { row[col] = vals[i]; });
          return row;
        }
        stmt.free();
        return undefined;
      },
      all(...params) {
        if (!db) return [];
        const results = [];
        const stmt = db.prepare(sql);
        stmt.bind(params);
        while (stmt.step()) {
          const cols = stmt.getColumnNames();
          const vals = stmt.get();
          const row = {};
          cols.forEach((col, i) => { row[col] = vals[i]; });
          results.push(row);
        }
        stmt.free();
        return results;
      }
    };
  },
  exec(sql) {
    if (db) {
      db.run(sql);
      saveDatabase();
    }
  },
  transaction(fn) {
    return function(...args) {
      db.run("BEGIN TRANSACTION");
      try {
        fn(...args);
        db.run("COMMIT");
        saveDatabase();
      } catch(e) {
        db.run("ROLLBACK");
        throw e;
      }
    };
  }
};

module.exports = { initDatabase, getDb, dbHelper, saveDatabase, saveDatabaseAsync };
