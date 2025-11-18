// src/db.ts
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

const ROOT = path.join(process.cwd(), 'data', 'guilds');

function ensureDir(p: string) { if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true }); }
function dbPath(gid: string) { ensureDir(ROOT); return path.join(ROOT, `${gid}.db`); }

export function openGuildDB(gid: string) {
  const db = new Database(dbPath(gid));
  db.pragma('journal_mode = WAL');

  // スキーマ（必要なら作成）
  db.exec(`
    CREATE TABLE IF NOT EXISTS counts (
      user_id   TEXT PRIMARY KEY,
      username  TEXT NOT NULL,
      reason    TEXT DEFAULT '',
      count     INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS immune (
      user_id TEXT PRIMARY KEY
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  return db;
}

// settings helper
export function getSetting(db: Database.Database, key: string): string | null {
  const row = db.prepare(`SELECT value FROM settings WHERE key=?`).get(key) as { value: string } | undefined;
  return row?.value ?? null;
}
export function setSetting(db: Database.Database, key: string, value: string) {
  db.prepare(`INSERT INTO settings(key,value) VALUES(?,?)
              ON CONFLICT(key) DO UPDATE SET value=excluded.value`).run(key, value);
}
