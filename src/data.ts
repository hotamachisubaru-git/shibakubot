// src/data.ts
import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';


// メダル用（非同期 sqlite）
import sqlite3 from 'sqlite3';
import { open, Database as SqliteDatabase } from 'sqlite';

export type CounterMap = Record<string, number>;
export type SbkLogRow = {
  id: number;
  at: number;
  actor: string | null;
  target: string;
  reason: string | null;
  delta: number;
};

// ---------- パス系 ----------
const DATA_DIR = path.join(process.cwd(), 'data', 'guilds');
function ensureDir(p: string) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}
function dbPath(gid: string) {
  ensureDir(DATA_DIR);
  return path.join(DATA_DIR, `${gid}.db`);
}

// メダルバンク DB パス
const MEDAL_DB_PATH = path.join(process.cwd(), 'data', 'medalbank.db');

// ---------- スキーマ & マイグレ ----------

function ensureSchema(db: Database.Database) {
  // 期待する各テーブルを作成
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
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS logs (
      id     INTEGER PRIMARY KEY AUTOINCREMENT,
      at     INTEGER NOT NULL,
      actor  TEXT,
      target TEXT NOT NULL,
      reason TEXT,
      delta  INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_music_settings (
      userId TEXT NOT NULL,
      key    TEXT NOT NULL,
      value  TEXT,
      PRIMARY KEY (userId, key)
    );

  `);

  // counts の列チェック（legacy: user / username → userId）
  const cols = db.prepare(`PRAGMA table_info(counts)`).all() as Array<{ name: string }>;
  const hasUserId   = cols.some(c => c.name === 'userId');
  const hasUser     = cols.some(c => c.name === 'user');
  const hasUsername = cols.some(c => c.name === 'username');

  if (!hasUserId && (hasUser || hasUsername)) {
    const sourceCol = hasUser ? 'user' : 'username';
    db.transaction(() => {
      db.exec(`ALTER TABLE counts RENAME TO counts_legacy;`);
      db.exec(`
        CREATE TABLE counts (
          userId TEXT PRIMARY KEY,
          count  INTEGER NOT NULL DEFAULT 0
        );
      `);
      db.exec(`
        INSERT INTO counts(userId, count)
        SELECT ${sourceCol}, count FROM counts_legacy;
      `);
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
  const rows = db
    .prepare(`SELECT userId, count FROM counts ORDER BY count DESC`)
    .all() as Array<{ userId: string; count: number }>;
  const map: CounterMap = {};
  for (const r of rows) map[r.userId] = r.count;
  return map;
}

export function getImmuneList(gid: string): string[] {
  const db = openDb(gid);
  const rows = db
    .prepare(`SELECT userId FROM immune`)
    .all() as Array<{ userId: string }>;
  return rows.map(r => r.userId);
}

// ---------- ログ ----------
export function getRecentLogs(gid: string, limit = 20): SbkLogRow[] {
  const db = openDb(gid);
  const rows = db.prepare(`
    SELECT id, at, actor, target, reason, delta
    FROM logs
    ORDER BY id DESC
    LIMIT ?
  `).all(limit) as SbkLogRow[];
  return rows;
}

export function getLogCount(gid: string): number {
  const db = openDb(gid);
  const row = db.prepare(`SELECT COUNT(*) AS count FROM logs`).get() as { count: number } | undefined;
  return row?.count ?? 0;
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

    db.prepare(`
      INSERT INTO logs(at, actor, target, reason, delta)
      VALUES(?,?,?,?,?)
    `).run(Date.now(), actor ?? null, userId, reason ?? null, by);

    const row = db
      .prepare(`SELECT count FROM counts WHERE userId=?`)
      .get(userId) as { count: number } | undefined;
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
  const row = db
    .prepare(`SELECT count FROM counts WHERE userId=?`)
    .get(userId) as { count: number } | undefined;
  return row?.count ?? 0;
}

// ---------- 免除 ----------
export function addImmuneId(gid: string, userId: string): boolean {
  const db = openDb(gid);
  return db
    .prepare(`INSERT OR IGNORE INTO immune(userId) VALUES(?)`)
    .run(userId).changes > 0;
}
export function removeImmuneId(gid: string, userId: string): boolean {
  const db = openDb(gid);
  return db
    .prepare(`DELETE FROM immune WHERE userId=?`)
    .run(userId).changes > 0;
}
export function isImmune(gid: string, userId: string): boolean {
  const db = openDb(gid);
  return !!db
    .prepare(`SELECT 1 FROM immune WHERE userId=?`)
    .get(userId);
}

// ---------- しばく回数の範囲 ----------
const SBK_MIN_KEY = 'sbkMin';
const SBK_MAX_KEY = 'sbkMax';
const SBK_MIN_DEFAULT = 1;
const SBK_MAX_DEFAULT = 25; // 初期値としてだけ使う

export function getSetting(gid: string, key: string): string | null {
  const db = openDb(gid);
  const row = db
    .prepare(`SELECT value FROM settings WHERE key=?`)
    .get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setSetting(gid: string, key: string, value: string | null) {
  const db = openDb(gid);
  if (value === null) {
    db.prepare(`DELETE FROM settings WHERE key=?`).run(key);
    return;
  }
  db.prepare(`
    INSERT INTO settings(key, value) VALUES(?, ?)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value
  `).run(key, value);
}

export function getSbkRange(gid: string): { min: number; max: number } {
  const db = openDb(gid);
  const minRow = db
    .prepare(`SELECT value FROM settings WHERE key=?`)
    .get(SBK_MIN_KEY) as { value: string } | undefined;
  const maxRow = db
    .prepare(`SELECT value FROM settings WHERE key=?`)
    .get(SBK_MAX_KEY) as { value: string } | undefined;

  let min = Number(minRow?.value ?? SBK_MIN_DEFAULT);
  let max = Number(maxRow?.value ?? SBK_MAX_DEFAULT);

  // 数値チェック & 下限だけ守る（1以上・max は min 以上）
  if (!Number.isFinite(min) || min < 1) min = SBK_MIN_DEFAULT;
  if (!Number.isFinite(max) || max < min) max = min;

  min = Math.floor(min);
  max = Math.floor(max);

  return { min, max };
}
// ---------- 音量設定 ----------
const MUSIC_VOL_KEY = 'musicVolume';
const MUSIC_VOL_DEFAULT = 100;
const MUSIC_VOL_MIN = 0;
const MUSIC_VOL_MAX = 200;

export function getUserMusicVolume(gid: string, userId: string): number {
  const db = openDb(gid);
  const row = db.prepare(
    `SELECT value FROM user_music_settings WHERE userId=? AND key=?`
  ).get(userId, MUSIC_VOL_KEY) as { value: string } | undefined;

  const v = Number(row?.value ?? MUSIC_VOL_DEFAULT);
  if (!Number.isFinite(v)) return MUSIC_VOL_DEFAULT;

  return Math.min(MUSIC_VOL_MAX, Math.max(MUSIC_VOL_MIN, Math.round(v)));
}

export function setUserMusicVolume(gid: string, userId: string, vol: number): number {
  const db = openDb(gid);

  const clamped = Math.min(MUSIC_VOL_MAX, Math.max(MUSIC_VOL_MIN, Math.round(vol)));

  db.prepare(`
    INSERT INTO user_music_settings(userId, key, value) VALUES(?, ?, ?)
    ON CONFLICT(userId, key) DO UPDATE SET value = excluded.value
  `).run(userId, MUSIC_VOL_KEY, String(clamped));

  return clamped;
}

export function setSbkRange(gid: string, min: number, max: number) {
  const db = openDb(gid);

  if (!Number.isFinite(min) || min < 1) min = SBK_MIN_DEFAULT;
  if (!Number.isFinite(max) || max < min) max = min;

  min = Math.floor(min);
  max = Math.floor(max);

  db.transaction(() => {
    db.prepare(`
      INSERT INTO settings(key, value) VALUES(?, ?)
      ON CONFLICT(key) DO UPDATE SET value=excluded.value
    `).run(SBK_MIN_KEY, String(min));
    db.prepare(`
      INSERT INTO settings(key, value) VALUES(?, ?)
      ON CONFLICT(key) DO UPDATE SET value=excluded.value
    `).run(SBK_MAX_KEY, String(max));
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

// ------------------------------
// メダルバンク（SQLite, 非同期）
// ------------------------------

let medalDB: SqliteDatabase | null = null;

async function getMedalDB(): Promise<SqliteDatabase> {
  if (!medalDB) {
    ensureDir(path.dirname(MEDAL_DB_PATH));
    medalDB = await open({
      filename: MEDAL_DB_PATH,
      driver: sqlite3.Database,
    });
    await medalDB.exec(`
      CREATE TABLE IF NOT EXISTS medals (
        user_id TEXT PRIMARY KEY,
        balance INTEGER NOT NULL
      );
    `);
  }
  return medalDB;
}

// 残高取得（なければ自動で 1000 を付与）
export async function getMedalBalance(userId: string): Promise<number> {
  const db = await getMedalDB();

  const row = await db.get(
    'SELECT balance FROM medals WHERE user_id = ?',
    userId
  );

  if (row) {
    return row.balance;
  }

  // ★ ここ：未登録ユーザー → 自動で 1000 を保存
  await db.run(
    'INSERT INTO medals (user_id, balance) VALUES (?, ?)',
    userId,
    1000
  );

  return 1000;
}

export async function getTopMedals(limit: number = 20): Promise<
  Array<{ userId: string; balance: number }>
> {
  const db = await getMedalDB();

  const rows = await db.all<{
    user_id: string;
    balance: number;
  }[]>(
    `
      SELECT user_id, balance
      FROM medals
      ORDER BY balance DESC
      LIMIT ?
    `,
    [limit]
  );

  return rows.map((r) => ({
    userId: r.user_id,
    balance: r.balance,
  }));
}



// 残高を上書き
export async function setMedals(userId: string, amount: number): Promise<number> {
  const db = await getMedalDB();
  await db.run(
    `
      INSERT INTO medals (user_id, balance)
      VALUES (?, ?)
      ON CONFLICT(user_id) DO UPDATE SET balance = excluded.balance;
    `,
    userId,
    amount
  );
  return amount;
}

// 増減
export async function addMedals(userId: string, diff: number): Promise<number> {
  const db = await getMedalDB();
  const before = await getMedalBalance(userId);
  const after = Math.max(0, before + diff);
  await db.run(
    `
      INSERT INTO medals (user_id, balance)
      VALUES (?, ?)
      ON CONFLICT(user_id) DO UPDATE SET balance = excluded.balance;
    `,
    userId,
    after
  );
  return after;
}
