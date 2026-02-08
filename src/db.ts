// src/db.ts
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(process.cwd(), "data", "guilds");
const UPSERT_SETTING_SQL = `
  INSERT INTO settings(key, value) VALUES(?, ?)
  ON CONFLICT(key) DO UPDATE SET value=excluded.value
`;

type SettingRow = { value: string };
type GuildDatabase = Database.Database;

function ensureDir(p: string): void {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}
function dbPath(gid: string): string {
  ensureDir(ROOT);
  return path.join(ROOT, `${gid}.db`);
}

export function openGuildDB(gid: string): GuildDatabase {
  const db = new Database(dbPath(gid));
  db.pragma("journal_mode = WAL");

  // スキーマ（必要なら作成）
  db.exec(`
    CREATE TABLE IF NOT EXISTS counts (
      user_id   TEXT PRIMARY KEY,
      username  TEXT NOT NULL,
      reason    TEXT DEFAULT '',
      count     TEXT NOT NULL DEFAULT '0'
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
export function getSetting(db: GuildDatabase, key: string): string | null {
  const row = db.prepare(`SELECT value FROM settings WHERE key=?`).get(key) as
    | SettingRow
    | undefined;
  return row?.value ?? null;
}
export function setSetting(db: GuildDatabase, key: string, value: string): void {
  db.prepare(UPSERT_SETTING_SQL).run(key, value);
}
