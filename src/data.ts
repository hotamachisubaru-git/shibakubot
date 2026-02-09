// src/data.ts
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { getRuntimeConfig } from "./config/runtime";
import { GUILD_DB_ROOT } from "./constants/paths";
import { SETTING_KEYS } from "./constants/settings";

export type CounterMap = Record<string, bigint>;
export type SbkRange = { min: number; max: number };
export type SbkLogRow = {
  id: number;
  at: number;
  actor: string | null;
  target: string;
  reason: string | null;
  delta: bigint;
};

const BIGINT_RE = /^-?\d+$/;
const runtimeConfig = getRuntimeConfig();

function hasTextAffinity(type?: string | null): boolean {
  const t = (type ?? "").toUpperCase();
  return t.includes("TEXT") || t.includes("CHAR") || t.includes("CLOB");
}

function coerceBigInt(value: unknown, fallback: bigint = 0n): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return fallback;
    return BigInt(Math.trunc(value));
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!BIGINT_RE.test(trimmed)) return fallback;
    try {
      return BigInt(trimmed);
    } catch {
      return fallback;
    }
  }
  return fallback;
}

function toBigIntInput(value: bigint | number): bigint {
  if (typeof value === "bigint") return value;
  if (!Number.isFinite(value)) return 0n;
  return BigInt(Math.trunc(value));
}

function toDbText(value: bigint): string {
  return value.toString();
}

function parseSettingBoolean(raw: string | null, fallback: boolean): boolean {
  if (raw === null) return fallback;
  return raw.toLowerCase() === "true";
}

// ---------- パス系 ----------
const DATA_DIR = GUILD_DB_ROOT;
function ensureDir(p: string) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}
function dbPath(gid: string) {
  ensureDir(DATA_DIR);
  return path.join(DATA_DIR, `${gid}.db`);
}

// ---------- スキーマ & マイグレ ----------

function ensureSchema(db: Database.Database) {
  // 期待する各テーブルを作成
  db.exec(`
    CREATE TABLE IF NOT EXISTS counts (
      userId TEXT PRIMARY KEY,
      count  TEXT NOT NULL DEFAULT '0'
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
      delta  TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_music_settings (
      userId TEXT NOT NULL,
      key    TEXT NOT NULL,
      value  TEXT,
      PRIMARY KEY (userId, key)
    );

  `);

  // counts の列チェック（legacy: user / username → userId）
  let cols = db.prepare(`PRAGMA table_info(counts)`).all() as Array<{
    name: string;
    type: string;
  }>;
  const hasUserId = cols.some((c) => c.name === "userId");
  const hasUser = cols.some((c) => c.name === "user");
  const hasUsername = cols.some((c) => c.name === "username");

  if (!hasUserId && (hasUser || hasUsername)) {
    const sourceCol = hasUser ? "user" : "username";
    db.transaction(() => {
      db.exec(`ALTER TABLE counts RENAME TO counts_legacy;`);
      db.exec(`
        CREATE TABLE counts (
          userId TEXT PRIMARY KEY,
          count  TEXT NOT NULL DEFAULT '0'
        );
      `);
      db.exec(`
        INSERT INTO counts(userId, count)
        SELECT ${sourceCol}, CAST(count AS TEXT) FROM counts_legacy;
      `);
      db.exec(`DROP TABLE counts_legacy;`);
    })();
  }

  cols = db.prepare(`PRAGMA table_info(counts)`).all() as Array<{
    name: string;
    type: string;
  }>;
  const countCol = cols.find((c) => c.name === "count");
  if (countCol && !hasTextAffinity(countCol.type)) {
    db.transaction(() => {
      db.exec(`ALTER TABLE counts RENAME TO counts_text_legacy;`);
      db.exec(`
        CREATE TABLE counts (
          userId TEXT PRIMARY KEY,
          count  TEXT NOT NULL DEFAULT '0'
        );
      `);
      db.exec(`
        INSERT INTO counts(userId, count)
        SELECT userId, CAST(count AS TEXT) FROM counts_text_legacy;
      `);
      db.exec(`DROP TABLE counts_text_legacy;`);
    })();
  }

  const logCols = db.prepare(`PRAGMA table_info(logs)`).all() as Array<{
    name: string;
    type: string;
  }>;
  const deltaCol = logCols.find((c) => c.name === "delta");
  if (deltaCol && !hasTextAffinity(deltaCol.type)) {
    db.transaction(() => {
      db.exec(`ALTER TABLE logs RENAME TO logs_text_legacy;`);
      db.exec(`
        CREATE TABLE logs (
          id     INTEGER PRIMARY KEY AUTOINCREMENT,
          at     INTEGER NOT NULL,
          actor  TEXT,
          target TEXT NOT NULL,
          reason TEXT,
          delta  TEXT NOT NULL
        );
      `);
      db.exec(`
        INSERT INTO logs(id, at, actor, target, reason, delta)
        SELECT id, at, actor, target, reason, CAST(delta AS TEXT) FROM logs_text_legacy;
      `);
      db.exec(`DROP TABLE logs_text_legacy;`);
    })();
  }
}

// ---------- DB open (これだけを使う) ----------
export function openDb(gid: string): Database.Database {
  const db = new Database(dbPath(gid));
  db.pragma("journal_mode = WAL");
  ensureSchema(db);
  return db;
}

// ---------- 読み取り ----------
export function getAllCounts(gid: string): CounterMap {
  const db = openDb(gid);
  const rows = db.prepare(`SELECT userId, count FROM counts`).all() as Array<{
    userId: string;
    count: unknown;
  }>;
  const map: CounterMap = {};
  for (const r of rows) map[r.userId] = coerceBigInt(r.count);
  return map;
}

export function getImmuneList(gid: string): string[] {
  const db = openDb(gid);
  const rows = db.prepare(`SELECT userId FROM immune`).all() as Array<{
    userId: string;
  }>;
  return rows.map((r) => r.userId);
}

// ---------- ログ ----------
export function getRecentLogs(gid: string, limit = 20): SbkLogRow[] {
  const db = openDb(gid);
  const rows = db
    .prepare(
      `
    SELECT id, at, actor, target, reason, delta
    FROM logs
    ORDER BY id DESC
    LIMIT ?
  `,
    )
    .all(limit) as Array<{
    id: number;
    at: number;
    actor: string | null;
    target: string;
    reason: string | null;
    delta: unknown;
  }>;
  return rows.map((row) => ({
    ...row,
    delta: coerceBigInt(row.delta),
  }));
}

export function getLogCount(gid: string): number {
  const db = openDb(gid);
  const row = db.prepare(`SELECT COUNT(*) AS count FROM logs`).get() as
    | { count: number }
    | undefined;
  return row?.count ?? 0;
}

// ---------- 書き込み ----------
export function addCountGuild(
  gid: string,
  userId: string,
  by: bigint | number = 1,
  actor?: string,
  reason?: string,
): bigint {
  const db = openDb(gid);
  const tx = db.transaction(() => {
    const delta = toBigIntInput(by);
    const currentRow = db
      .prepare(`SELECT count FROM counts WHERE userId=?`)
      .get(userId) as { count: unknown } | undefined;
    const current = coerceBigInt(currentRow?.count);
    const next = current + delta;

    db.prepare(
      `
      INSERT INTO counts(userId, count) VALUES(?, ?)
      ON CONFLICT(userId) DO UPDATE SET count = excluded.count
    `,
    ).run(userId, toDbText(next));

    db.prepare(
      `
      INSERT INTO logs(at, actor, target, reason, delta)
      VALUES(?,?,?,?,?)
    `,
    ).run(Date.now(), actor ?? null, userId, reason ?? null, toDbText(delta));

    return next;
  });
  return tx();
}

export function setCountGuild(
  gid: string,
  userId: string,
  value: bigint | number,
): bigint {
  const db = openDb(gid);
  const next = toBigIntInput(value);
  const clamped = next < 0n ? 0n : next;
  db.prepare(
    `
    INSERT INTO counts(userId, count) VALUES(?, ?)
    ON CONFLICT(userId) DO UPDATE SET count = excluded.count
  `,
  ).run(userId, toDbText(clamped));
  const row = db
    .prepare(`SELECT count FROM counts WHERE userId=?`)
    .get(userId) as { count: unknown } | undefined;
  return row ? coerceBigInt(row.count) : clamped;
}

// ---------- 免除 ----------
export function addImmuneId(gid: string, userId: string): boolean {
  const db = openDb(gid);
  return (
    db.prepare(`INSERT OR IGNORE INTO immune(userId) VALUES(?)`).run(userId)
      .changes > 0
  );
}
export function removeImmuneId(gid: string, userId: string): boolean {
  const db = openDb(gid);
  return (
    db.prepare(`DELETE FROM immune WHERE userId=?`).run(userId).changes > 0
  );
}
export function isImmune(gid: string, userId: string): boolean {
  const db = openDb(gid);
  return !!db.prepare(`SELECT 1 FROM immune WHERE userId=?`).get(userId);
}

// ---------- しばく回数の範囲 ----------
const SBK_MIN_DEFAULT = runtimeConfig.sbk.min;
const SBK_MAX_DEFAULT = runtimeConfig.sbk.max; // 初期値としてだけ使う

export function getSetting(gid: string, key: string): string | null {
  const db = openDb(gid);
  const row = db.prepare(`SELECT value FROM settings WHERE key=?`).get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

export function setSetting(gid: string, key: string, value: string | null) {
  const db = openDb(gid);
  if (value === null) {
    db.prepare(`DELETE FROM settings WHERE key=?`).run(key);
    return;
  }
  db.prepare(
    `
    INSERT INTO settings(key, value) VALUES(?, ?)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value
  `,
  ).run(key, value);
}

export function getSbkRange(gid: string): SbkRange {
  const db = openDb(gid);
  const minRow = db
    .prepare(`SELECT value FROM settings WHERE key=?`)
    .get(SETTING_KEYS.sbkMin) as { value: string } | undefined;
  const maxRow = db
    .prepare(`SELECT value FROM settings WHERE key=?`)
    .get(SETTING_KEYS.sbkMax) as { value: string } | undefined;

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
const MUSIC_VOL_DEFAULT = runtimeConfig.music.fixedVolume;
const MUSIC_VOL_MIN = 0;
const MUSIC_VOL_MAX = 20;

export function getUserMusicVolume(gid: string, userId: string): number {
  const db = openDb(gid);
  const row = db
    .prepare(`SELECT value FROM user_music_settings WHERE userId=? AND key=?`)
    .get(userId, SETTING_KEYS.musicVolume) as { value: string } | undefined;

  const v = Number(row?.value ?? MUSIC_VOL_DEFAULT);
  if (!Number.isFinite(v)) return MUSIC_VOL_DEFAULT;

  return Math.min(MUSIC_VOL_MAX, Math.max(MUSIC_VOL_MIN, Math.round(v)));
}

export function setUserMusicVolume(
  gid: string,
  userId: string,
  vol: number,
): number {
  const db = openDb(gid);

  const clamped = Math.min(
    MUSIC_VOL_MAX,
    Math.max(MUSIC_VOL_MIN, Math.round(vol)),
  );

  db.prepare(
    `
    INSERT INTO user_music_settings(userId, key, value) VALUES(?, ?, ?)
    ON CONFLICT(userId, key) DO UPDATE SET value = excluded.value
  `,
  ).run(userId, SETTING_KEYS.musicVolume, String(clamped));

  return clamped;
}

// ---------- 音楽 NG ワード ----------
function normalizeNgWord(word: string): string {
  return word.trim().toLowerCase();
}

function saveMusicNgWords(gid: string, words: string[]): string[] {
  const normalized = Array.from(
    new Set(words.map(normalizeNgWord).filter((w) => w.length > 0)),
  ).sort();
  setSetting(gid, SETTING_KEYS.musicNgWords, JSON.stringify(normalized));
  return normalized;
}

export function getMusicNgWords(gid: string): string[] {
  const raw = getSetting(gid, SETTING_KEYS.musicNgWords);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return Array.from(
      new Set(
        parsed
          .filter((w) => typeof w === "string")
          .map((w) => normalizeNgWord(w))
          .filter((w) => w.length > 0),
      ),
    ).sort();
  } catch {
    return [];
  }
}

export function addMusicNgWord(
  gid: string,
  word: string,
): { added: boolean; list: string[] } {
  const current = getMusicNgWords(gid);
  const normalized = normalizeNgWord(word);
  if (!normalized) return { added: false, list: current };
  if (current.includes(normalized)) return { added: false, list: current };

  const list = saveMusicNgWords(gid, [...current, normalized]);
  return { added: true, list };
}

export function removeMusicNgWord(
  gid: string,
  word: string,
): { removed: boolean; list: string[] } {
  const current = getMusicNgWords(gid);
  const normalized = normalizeNgWord(word);
  if (!normalized) return { removed: false, list: current };

  const next = current.filter((w) => w !== normalized);
  if (next.length === current.length) return { removed: false, list: current };

  const list = saveMusicNgWords(gid, next);
  return { removed: true, list };
}

export function clearMusicNgWords(gid: string): void {
  setSetting(gid, SETTING_KEYS.musicNgWords, JSON.stringify([]));
}
// ---------- 音楽機能有効化設定 ----------
export function getMusicEnabled(gid: string): boolean {
  return parseSettingBoolean(getSetting(gid, SETTING_KEYS.musicEnabled), true);
}

export function setMusicEnabled(gid: string, enabled: boolean): void {
  setSetting(gid, SETTING_KEYS.musicEnabled, enabled ? "true" : "false");
}

// ---------- メンテナンスモード ----------
export function getMaintenanceEnabled(gid: string): boolean {
  return parseSettingBoolean(
    getSetting(gid, SETTING_KEYS.maintenanceEnabled),
    false,
  );
}

export function setMaintenanceEnabled(gid: string, enabled: boolean): void {
  setSetting(gid, SETTING_KEYS.maintenanceEnabled, enabled ? "true" : "false");
}

export function setSbkRange(gid: string, min: number, max: number): SbkRange {
  const db = openDb(gid);

  const normalizedMin =
    Number.isFinite(min) && min >= 1 ? Math.floor(min) : SBK_MIN_DEFAULT;
  const normalizedMaxCandidate =
    Number.isFinite(max) ? Math.floor(max) : normalizedMin;
  const normalizedMax = Math.max(normalizedMin, normalizedMaxCandidate);

  db.transaction(() => {
    db.prepare(
      `
      INSERT INTO settings(key, value) VALUES(?, ?)
      ON CONFLICT(key) DO UPDATE SET value=excluded.value
    `,
    ).run(SETTING_KEYS.sbkMin, String(normalizedMin));
    db.prepare(
      `
      INSERT INTO settings(key, value) VALUES(?, ?)
      ON CONFLICT(key) DO UPDATE SET value=excluded.value
    `,
    ).run(SETTING_KEYS.sbkMax, String(normalizedMax));
  })();

  return { min: normalizedMin, max: normalizedMax };
}

// ---------- 互換ラッパ ----------
export function loadGuildStore(gid: string): {
  counts: CounterMap;
  immune: string[];
  settings: { sbkMin: number; sbkMax: number };
} {
  const { min, max } = getSbkRange(gid);
  return {
    counts: getAllCounts(gid),
    immune: getImmuneList(gid),
    settings: { sbkMin: min, sbkMax: max },
  };
}
