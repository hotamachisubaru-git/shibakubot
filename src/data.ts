// src/data.ts
import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';

export type CounterMap = Record<string, number>;

// ---------- パス系 ----------
const DATA_DIR = path.join(process.cwd(), 'data', 'guilds');
function ensureDir(p: string) { if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true }); }
function dbPath(gid: string) { ensureDir(DATA_DIR); return path.join(DATA_DIR, `${gid}.db`); }

// ---------- スキーマ & マイグレ ----------
function ensureSchema(db: Database.Database) {
  // 期待スキーマを作成
  db.exec(`
    CREATE TABLE IF NOT EXISTS counts (
      userId TEXT PRIMARY KEY,
      count  INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS immune (
      userId TEXT PRIMARY KEY
    );
    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS logs (
      id     INTEGER PRIMARY KEY AUTOINCREMENT,
      at     INTEGER NOT NULL,
      actor  TEXT,
      target TEXT NOT NULL,
      reason TEXT,
      delta  INTEGER NOT NULL
    );
  `);

  // counts の列チェック（legacy: user / username → userId に統一）
  const cols = db.prepare(`PRAGMA table_info(counts)`).all() as Array<{ name: string }>;
  const hasUserId   = cols.some(c => c.name === 'userId');
  const hasUser     = cols.some(c => c.name === 'user');
  const hasUsername = cols.some(c => c.name === 'username');

  if (!hasUserId && (hasUser || hasUsername)) {
    const sourceCol = hasUser ? 'user' : 'username';
    db.transaction(() => {
      db.exec(`ALTER TABLE counts RENAME TO counts_legacy;`);
      db.exec(`CREATE TABLE counts (userId TEXT PRIMARY KEY, count INTEGER NOT NULL DEFAULT 0);`);
      db.exec(`INSERT INTO counts(userId, count) SELECT ${sourceCol}, count FROM counts_legacy;`);
      db.exec(`DROP TABLE counts_legacy;`);
    })();
  }
}

// ---------- DB open (これだけを使う) ----------
export function openDb(gid: string) {
  const db = new Database(dbPath(gid));
  db.pragma('journal_mode = WAL');
  ensureSchema(db);
  return db;
}

// ---------- 読み取り ----------
export function getAllCounts(gid: string): CounterMap {
  const db = openDb(gid);
  const rows = db.prepare(`SELECT userId, count FROM counts ORDER BY count DESC`)
                 .all() as Array<{ userId: string; count: number }>;
  const map: CounterMap = {};
  for (const r of rows) map[r.userId] = r.count;
  return map;
}

export function getImmuneList(gid: string): string[] {
  const db = openDb(gid);
  const rows = db.prepare(`SELECT userId FROM immune`).all() as Array<{ userId: string }>;
  return rows.map(r => r.userId);
}

// ---------- 書き込み ----------
export function addCountGuild(
  gid: string,
  userId: string,
  by = 1,
  actor?: string,
  reason?: string
): number {
  const db = openDb(gid);
  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO counts(userId, count) VALUES(?, ?)
      ON CONFLICT(userId) DO UPDATE SET count = count + excluded.count
    `).run(userId, by);

    db.prepare(`INSERT INTO logs(at, actor, target, reason, delta) VALUES(?,?,?,?,?)`)
      .run(Date.now(), actor ?? null, userId, reason ?? null, by);

    const row = db.prepare(`SELECT count FROM counts WHERE userId=?`).get(userId) as { count: number } | undefined;
    return row?.count ?? by;
  });
  return tx();
}

export function setCountGuild(gid: string, userId: string, value: number): number {
  const db = openDb(gid);
  db.prepare(`
    INSERT INTO counts(userId, count) VALUES(?, ?)
    ON CONFLICT(userId) DO UPDATE SET count = excluded.count
  `).run(userId, Math.max(0, value));
  const row = db.prepare(`SELECT count FROM counts WHERE userId=?`).get(userId) as { count: number } | undefined;
  return row?.count ?? 0;
}

// ---------- 免除 ----------
export function addImmuneId(gid: string, userId: string): boolean {
  const db = openDb(gid);
  return db.prepare(`INSERT OR IGNORE INTO immune(userId) VALUES(?)`).run(userId).changes > 0;
}
export function removeImmuneId(gid: string, userId: string): boolean {
  const db = openDb(gid);
  return db.prepare(`DELETE FROM immune WHERE userId=?`).run(userId).changes > 0;
}
export function isImmune(gid: string, userId: string): boolean {
  const db = openDb(gid);
  return !!db.prepare(`SELECT 1 FROM immune WHERE userId=?`).get(userId);
}

// ---------- しばく回数の範囲 ----------
const SBK_MIN_KEY = 'sbkMin';
const SBK_MAX_KEY = 'sbkMax';
const SBK_MIN_DEFAULT = 1;
const SBK_MAX_DEFAULT = 25;

export function getSbkRange(gid: string): { min: number; max: number } {
  const db = openDb(gid);
  const minRow = db.prepare(`SELECT value FROM settings WHERE key=?`).get(SBK_MIN_KEY) as { value: string } | undefined;
  const maxRow = db.prepare(`SELECT value FROM settings WHERE key=?`).get(SBK_MAX_KEY) as { value: string } | undefined;
  let min = Number(minRow?.value ?? SBK_MIN_DEFAULT);
  let max = Number(maxRow?.value ?? SBK_MAX_DEFAULT);
  min = Math.max(1, Math.min(min, 25));
  max = Math.max(min, Math.min(max, 25));
  return { min, max };
}

export function setSbkRange(gid: string, min: number, max: number) {
  const db = openDb(gid);
  min = Math.max(1, Math.min(min, 25));
  max = Math.max(min, Math.min(max, 25));
  db.transaction(() => {
    db.prepare(`INSERT INTO settings(key, value) VALUES(?, ?)
      ON CONFLICT(key) DO UPDATE SET value=excluded.value`).run(SBK_MIN_KEY, String(min));
    db.prepare(`INSERT INTO settings(key, value) VALUES(?, ?)
      ON CONFLICT(key) DO UPDATE SET value=excluded.value`).run(SBK_MAX_KEY, String(max));
  })();
  return { min, max };
}

// ---------- 互換ラッパ ----------
export function loadGuildStore(gid: string) {
  const { min, max } = getSbkRange(gid);
  return {
    counts: getAllCounts(gid),
    immune: getImmuneList(gid),
    settings: { sbkMin: min, sbkMax: max },
  };
}
