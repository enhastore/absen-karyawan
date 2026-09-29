const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'database.sqlite');

let db = null;

// Initialize database
async function initDatabase() {
  const SQL = await initSqlJs();
  
  // Load existing database or create new one
  if (fs.existsSync(dbPath)) {
    const fileBuffer = fs.readFileSync(dbPath);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
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

  try {
    const tableInfo = db.exec("PRAGMA table_info(users)");
    const cols = tableInfo.length > 0 ? tableInfo[0].values.map(v => v[1]) : [];
    if (!cols.includes('telegram_chat_id')) {
      db.run("ALTER TABLE users ADD COLUMN telegram_chat_id TEXT");
    }
    if (!cols.includes('telegram_username')) {
      db.run("ALTER TABLE users ADD COLUMN telegram_username TEXT");
    }
  } catch(e) {
    console.warn("Notice checking telegram columns:", e.message);
  }

  saveDatabase();
  return db;
}

// Save database to file
function saveDatabase() {
  if (db && !process.env.VERCEL) {
    try {
      const data = db.export();
      const buffer = Buffer.from(data);
      fs.writeFileSync(dbPath, buffer);
    } catch (e) {
      console.warn('saveDatabase warning:', e.message);
    }
  }
}

// Auto-save every 30 seconds (only in non-serverless environments)
if (!process.env.VERCEL) {
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
    return {
      run(...params) {
        db.run(sql, params);
        saveDatabase();
        const result = db.exec("SELECT last_insert_rowid() as id");
        return { 
          lastInsertRowid: result.length > 0 ? result[0].values[0][0] : 0,
          changes: db.getRowsModified()
        };
      },
      get(...params) {
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
    db.run(sql);
    saveDatabase();
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

module.exports = { initDatabase, getDb, dbHelper, saveDatabase };
