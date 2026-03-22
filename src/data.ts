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
export type CountRankingEntry = readonly [userId: string, count: bigint];
export type GuildStatsSnapshot = {
  total: bigint;
  members: number;
  immune: number;
};
export type GuildDbInfo = {
  counts: number;
  immune: number;
  logs: number;
  settings: number;
  sizeBytes: number;
};

type GuildDbStatements = {
  selectAllCounts: Database.Statement;
  selectCountByUser: Database.Statement;
  upsertCount: Database.Statement;
  resetAllCounts: Database.Statement;
  countTrackedUsers: Database.Statement;
  selectRankedCountsPage: Database.Statement;
  selectAllImmuneIds: Database.Statement;
  selectImmuneId: Database.Statement;
  insertImmuneId: Database.Statement;
  deleteImmuneId: Database.Statement;
  countImmuneIds: Database.Statement;
  selectSetting: Database.Statement;
  upsertSetting: Database.Statement;
  deleteSetting: Database.Statement;
  selectRecentLogs: Database.Statement;
  countLogs: Database.Statement;
  insertLog: Database.Statement;
  countSettings: Database.Statement;
  selectMusicVolume: Database.Statement;
  upsertMusicVolume: Database.Statement;
};

type GuildDbContext = {
  db: Database.Database;
  statements: GuildDbStatements;
  settingsCache: Map<string, string | null>;
  countsCache: CounterMap | null;
  immuneCache: Set<string> | null;
};

const BIGINT_RE = /^-?\d+$/;
const runtimeConfig = getRuntimeConfig();
const guildDbContexts = new Map<string, GuildDbContext>();

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

function sumCounts(counts: CounterMap): bigint {
  let total = 0n;
  for (const value of Object.values(counts)) {
    total += value;
  }
  return total;
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

function buildStatements(db: Database.Database): GuildDbStatements {
  return {
    selectAllCounts: db.prepare(`SELECT userId, count FROM counts`),
    selectCountByUser: db.prepare(`SELECT count FROM counts WHERE userId=?`),
    upsertCount: db.prepare(`
      INSERT INTO counts(userId, count) VALUES(?, ?)
      ON CONFLICT(userId) DO UPDATE SET count = excluded.count
    `),
    resetAllCounts: db.prepare(`UPDATE counts SET count='0'`),
    countTrackedUsers: db.prepare(`SELECT COUNT(*) AS count FROM counts`),
    // count は TEXT 管理なので、非負整数である前提で桁数 -> 文字列の順に並べる。
    selectRankedCountsPage: db.prepare(`
      SELECT userId, count
      FROM counts
      ORDER BY LENGTH(count) DESC, count DESC, userId ASC
      LIMIT ? OFFSET ?
    `),
    selectAllImmuneIds: db.prepare(`SELECT userId FROM immune`),
    selectImmuneId: db.prepare(`SELECT userId FROM immune WHERE userId=?`),
    insertImmuneId: db.prepare(`INSERT OR IGNORE INTO immune(userId) VALUES(?)`),
    deleteImmuneId: db.prepare(`DELETE FROM immune WHERE userId=?`),
    countImmuneIds: db.prepare(`SELECT COUNT(*) AS count FROM immune`),
    selectSetting: db.prepare(`SELECT value FROM settings WHERE key=?`),
    upsertSetting: db.prepare(`
      INSERT INTO settings(key, value) VALUES(?, ?)
      ON CONFLICT(key) DO UPDATE SET value=excluded.value
    `),
    deleteSetting: db.prepare(`DELETE FROM settings WHERE key=?`),
    selectRecentLogs: db.prepare(`
      SELECT id, at, actor, target, reason, delta
      FROM logs
      ORDER BY id DESC
      LIMIT ?
    `),
    countLogs: db.prepare(`SELECT COUNT(*) AS count FROM logs`),
    insertLog: db.prepare(`
      INSERT INTO logs(at, actor, target, reason, delta)
      VALUES(?,?,?,?,?)
    `),
    countSettings: db.prepare(`SELECT COUNT(*) AS count FROM settings`),
    selectMusicVolume: db.prepare(`
      SELECT value
      FROM user_music_settings
      WHERE userId=? AND key=?
    `),
    upsertMusicVolume: db.prepare(`
      INSERT INTO user_music_settings(userId, key, value) VALUES(?, ?, ?)
      ON CONFLICT(userId, key) DO UPDATE SET value = excluded.value
    `),
  };
}

// ---------- DB open ----------
export function openDb(gid: string): Database.Database {
  const db = new Database(dbPath(gid));
  db.pragma("journal_mode = WAL");
  ensureSchema(db);
  return db;
}

function createGuildDbContext(gid: string): GuildDbContext {
  const db = openDb(gid);
  return {
    db,
    statements: buildStatements(db),
    settingsCache: new Map(),
    countsCache: null,
    immuneCache: null,
  };
}

function getGuildDbContext(gid: string): GuildDbContext {
  const existing = guildDbContexts.get(gid);
  if (existing) {
    return existing;
  }

  const created = createGuildDbContext(gid);
  guildDbContexts.set(gid, created);
  return created;
}

function closeGuildDbContext(gid: string): void {
  const existing = guildDbContexts.get(gid);
  if (!existing) return;

  guildDbContexts.delete(gid);
  try {
    existing.db.close();
  } catch {
    // noop
  }
}

function closeAllGuildDbContexts(): void {
  for (const gid of [...guildDbContexts.keys()]) {
    closeGuildDbContext(gid);
  }
}

process.once("exit", () => {
  closeAllGuildDbContexts();
});

function loadCountsCache(context: GuildDbContext): CounterMap {
  if (context.countsCache) {
    return context.countsCache;
  }

  const map: CounterMap = {};
  const rows = context.statements.selectAllCounts.all() as Array<{
    userId: string;
    count: unknown;
  }>;
  for (const row of rows) {
    map[row.userId] = coerceBigInt(row.count);
  }

  context.countsCache = map;
  return map;
}

function loadImmuneCache(context: GuildDbContext): Set<string> {
  if (context.immuneCache) {
    return context.immuneCache;
  }

  const ids = new Set<string>();
  const rows = context.statements.selectAllImmuneIds.all() as Array<{
    userId: string;
  }>;
  for (const row of rows) {
    ids.add(row.userId);
  }

  context.immuneCache = ids;
  return ids;
}

function getCountRow(context: GuildDbContext, userId: string): bigint {
  const row = context.statements.selectCountByUser.get(userId) as
    | { count: unknown }
    | undefined;
  return coerceBigInt(row?.count);
}

function runGuildMaintenance<T>(
  gid: string,
  task: (db: Database.Database) => T,
): T {
  closeGuildDbContext(gid);
  const db = openDb(gid);
  try {
    return task(db);
  } finally {
    db.close();
  }
}

// ---------- 読み取り ----------
export function getAllCounts(gid: string): CounterMap {
  const counts = loadCountsCache(getGuildDbContext(gid));
  return { ...counts };
}

export function getUserCount(gid: string, userId: string): bigint {
  const context = getGuildDbContext(gid);
  if (context.countsCache) {
    return context.countsCache[userId] ?? 0n;
  }
  return getCountRow(context, userId);
}

export function getTrackedUserCount(gid: string): number {
  const context = getGuildDbContext(gid);
  if (context.countsCache) {
    return Object.keys(context.countsCache).length;
  }

  const row = context.statements.countTrackedUsers.get() as
    | { count: number }
    | undefined;
  return row?.count ?? 0;
}

export function getCountRankingPage(
  gid: string,
  offset: number,
  limit: number,
): CountRankingEntry[] {
  const context = getGuildDbContext(gid);
  const rows = context.statements.selectRankedCountsPage.all(limit, offset) as Array<{
    userId: string;
    count: unknown;
  }>;

  return rows.map(
    (row) => [row.userId, coerceBigInt(row.count)] as CountRankingEntry,
  );
}

export function getTopCountEntries(
  gid: string,
  limit: number,
): CountRankingEntry[] {
  return getCountRankingPage(gid, 0, limit);
}

export function getImmuneList(gid: string): string[] {
  return [...loadImmuneCache(getGuildDbContext(gid))];
}

export function getGuildStatsSnapshot(gid: string): GuildStatsSnapshot {
  const context = getGuildDbContext(gid);
  const counts = loadCountsCache(context);
  const immune = loadImmuneCache(context);

  return {
    total: sumCounts(counts),
    members: Object.keys(counts).length,
    immune: immune.size,
  };
}

// ---------- ログ ----------
export function getRecentLogs(gid: string, limit = 20): SbkLogRow[] {
  const context = getGuildDbContext(gid);
  const rows = context.statements.selectRecentLogs.all(limit) as Array<{
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
  const context = getGuildDbContext(gid);
  const row = context.statements.countLogs.get() as { count: number } | undefined;
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
  const context = getGuildDbContext(gid);
  const tx = context.db.transaction(() => {
    const delta = toBigIntInput(by);
    const current = context.countsCache
      ? (context.countsCache[userId] ?? 0n)
      : getCountRow(context, userId);
    const next = current + delta;

    context.statements.upsertCount.run(userId, toDbText(next));
    context.statements.insertLog.run(
      Date.now(),
      actor ?? null,
      userId,
      reason ?? null,
      toDbText(delta),
    );

    if (context.countsCache) {
      context.countsCache[userId] = next;
    }

    return next;
  });

  return tx();
}

export function setCountGuild(
  gid: string,
  userId: string,
  value: bigint | number,
): bigint {
  const context = getGuildDbContext(gid);
  const next = toBigIntInput(value);
  const clamped = next < 0n ? 0n : next;

  context.statements.upsertCount.run(userId, toDbText(clamped));

  if (context.countsCache) {
    context.countsCache[userId] = clamped;
  }

  return clamped;
}

export function resetAllCounts(gid: string): void {
  const context = getGuildDbContext(gid);
  context.statements.resetAllCounts.run();

  if (!context.countsCache) {
    return;
  }

  for (const userId of Object.keys(context.countsCache)) {
    context.countsCache[userId] = 0n;
  }
}

// ---------- 免除 ----------
export function addImmuneId(gid: string, userId: string): boolean {
  const context = getGuildDbContext(gid);
  const added = context.statements.insertImmuneId.run(userId).changes > 0;
  if (added && context.immuneCache) {
    context.immuneCache.add(userId);
  }
  return added;
}

export function removeImmuneId(gid: string, userId: string): boolean {
  const context = getGuildDbContext(gid);
  const removed = context.statements.deleteImmuneId.run(userId).changes > 0;
  if (removed && context.immuneCache) {
    context.immuneCache.delete(userId);
  }
  return removed;
}

export function isImmune(gid: string, userId: string): boolean {
  const context = getGuildDbContext(gid);
  if (context.immuneCache) {
    return context.immuneCache.has(userId);
  }
  return !!context.statements.selectImmuneId.get(userId);
}

// ---------- 設定 ----------
const SBK_MIN_DEFAULT = runtimeConfig.sbk.min;
const SBK_MAX_DEFAULT = runtimeConfig.sbk.max;

export function getSetting(gid: string, key: string): string | null {
  const context = getGuildDbContext(gid);
  if (context.settingsCache.has(key)) {
    return context.settingsCache.get(key) ?? null;
  }

  const row = context.statements.selectSetting.get(key) as
    | { value: string }
    | undefined;
  const value = row?.value ?? null;
  context.settingsCache.set(key, value);
  return value;
}

export function setSetting(gid: string, key: string, value: string | null) {
  const context = getGuildDbContext(gid);

  if (value === null) {
    context.statements.deleteSetting.run(key);
    context.settingsCache.set(key, null);
    return;
  }

  context.statements.upsertSetting.run(key, value);
  context.settingsCache.set(key, value);
}

export function getSbkRange(gid: string): SbkRange {
  let min = Number(getSetting(gid, SETTING_KEYS.sbkMin) ?? SBK_MIN_DEFAULT);
  let max = Number(getSetting(gid, SETTING_KEYS.sbkMax) ?? SBK_MAX_DEFAULT);

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
  const context = getGuildDbContext(gid);
  const row = context.statements.selectMusicVolume.get(
    userId,
    SETTING_KEYS.musicVolume,
  ) as { value: string } | undefined;

  const v = Number(row?.value ?? MUSIC_VOL_DEFAULT);
  if (!Number.isFinite(v)) return MUSIC_VOL_DEFAULT;

  return Math.min(MUSIC_VOL_MAX, Math.max(MUSIC_VOL_MIN, Math.round(v)));
}

export function setUserMusicVolume(
  gid: string,
  userId: string,
  vol: number,
): number {
  const context = getGuildDbContext(gid);
  const clamped = Math.min(
    MUSIC_VOL_MAX,
    Math.max(MUSIC_VOL_MIN, Math.round(vol)),
  );

  context.statements.upsertMusicVolume.run(
    userId,
    SETTING_KEYS.musicVolume,
    String(clamped),
  );

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
  const context = getGuildDbContext(gid);
  const normalizedMin =
    Number.isFinite(min) && min >= 1 ? Math.floor(min) : SBK_MIN_DEFAULT;
  const normalizedMaxCandidate =
    Number.isFinite(max) ? Math.floor(max) : normalizedMin;
  const normalizedMax = Math.max(normalizedMin, normalizedMaxCandidate);

  context.db.transaction(() => {
    context.statements.upsertSetting.run(
      SETTING_KEYS.sbkMin,
      String(normalizedMin),
    );
    context.statements.upsertSetting.run(
      SETTING_KEYS.sbkMax,
      String(normalizedMax),
    );
  })();

  context.settingsCache.set(SETTING_KEYS.sbkMin, String(normalizedMin));
  context.settingsCache.set(SETTING_KEYS.sbkMax, String(normalizedMax));

  return { min: normalizedMin, max: normalizedMax };
}

// ---------- 保守用 ----------
export function getGuildDbInfo(gid: string): GuildDbInfo {
  return runGuildMaintenance(gid, (db) => {
    const countRow = db
      .prepare(`SELECT COUNT(*) AS count FROM counts`)
      .get() as { count: number } | undefined;
    const immuneRow = db
      .prepare(`SELECT COUNT(*) AS count FROM immune`)
      .get() as { count: number } | undefined;
    const logRow = db
      .prepare(`SELECT COUNT(*) AS count FROM logs`)
      .get() as { count: number } | undefined;
    const settingsRow = db
      .prepare(`SELECT COUNT(*) AS count FROM settings`)
      .get() as { count: number } | undefined;
    const fullPath = dbPath(gid);

    return {
      counts: countRow?.count ?? 0,
      immune: immuneRow?.count ?? 0,
      logs: logRow?.count ?? 0,
      settings: settingsRow?.count ?? 0,
      sizeBytes: fs.existsSync(fullPath) ? fs.statSync(fullPath).size : 0,
    };
  });
}

export function checkpointGuildDb(gid: string): void {
  runGuildMaintenance(gid, (db) => {
    db.pragma("wal_checkpoint(TRUNCATE)");
  });
}

export function vacuumGuildDb(gid: string): void {
  runGuildMaintenance(gid, (db) => {
    db.exec("VACUUM");
  });
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
