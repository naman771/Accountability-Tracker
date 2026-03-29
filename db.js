import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, 'tracker.db');

const db = new Database(dbPath);

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    display_name TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS weekly_goals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    week_start DATE NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    weekly_target REAL NOT NULL,
    unit TEXT DEFAULT 'tasks',
    goal_type TEXT DEFAULT 'weekly',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    UNIQUE(user_id, week_start, title)
  );

  CREATE TABLE IF NOT EXISTS daily_progress (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    goal_id INTEGER NOT NULL,
    date DATE NOT NULL,
    daily_target REAL NOT NULL,
    completed REAL DEFAULT 0,
    completion_percent INTEGER DEFAULT 0,
    notes TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (goal_id) REFERENCES weekly_goals(id) ON DELETE CASCADE,
    UNIQUE(user_id, goal_id, date)
  );
`);

// Migration: add goal_type column if missing (for existing databases)
try {
  db.exec(`ALTER TABLE weekly_goals ADD COLUMN goal_type TEXT DEFAULT 'weekly'`);
} catch (e) {
  // Column already exists — safe to ignore
}

// Ensure default users exist (upsert-style so redeploys don't skip new users)
const defaultUsers = [
  { username: 'naman', password: 'naman', name: 'Naman' },
  { username: 'dhruv', password: 'dhruv', name: 'Dhruv' },
  { username: 'shubh', password: 'shubh', name: 'Shubh' },
];

const upsertUsers = db.transaction(() => {
  for (const user of defaultUsers) {
    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(user.username);
    if (!existing) {
      const hash = bcrypt.hashSync(user.password, 10);
      db.prepare('INSERT INTO users (username, password, display_name) VALUES (?, ?, ?)').run(user.username, hash, user.name);
      console.log(`✅ Created user: ${user.username}`);
    }
  }
});
upsertUsers();

export default db;
