import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { GUILD_DB_ROOT } from "../constants/paths";

export type CounterMap = Record<string, bigint>;
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

export type GuildDbStatements = {
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
  selectAllIgnoredIds: Database.Statement;
  selectIgnoredId: Database.Statement;
  insertIgnoredId: Database.Statement;
  deleteIgnoredId: Database.Statement;
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

export type GuildDbContext = {
  db: Database.Database;
  statements: GuildDbStatements;
  settingsCache: Map<string, string | null>;
  countsCache: CounterMap | null;
  immuneCache: Set<string> | null;
  ignoredCache: Set<string> | null;
};

const BIGINT_RE = /^-?\d+$/;
const DATA_DIR = GUILD_DB_ROOT;
const guildDbContexts = new Map<string, GuildDbContext>();

function hasTextAffinity(type?: string | null): boolean {
  const t = (type ?? "").toUpperCase();
  return t.includes("TEXT") || t.includes("CHAR") || t.includes("CLOB");
}

export function coerceBigInt(
  value: unknown,
  fallback: bigint = 0n,
): bigint {
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

export function parseSettingBoolean(
  raw: string | null,
  fallback: boolean,
): boolean {
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

function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function dbPath(gid: string): string {
  ensureDir(DATA_DIR);
  return path.join(DATA_DIR, `${gid}.db`);
}

function ensureSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS counts (
      userId TEXT PRIMARY KEY,
      count  TEXT NOT NULL DEFAULT '0'
    );

    CREATE TABLE IF NOT EXISTS immune (
      userId TEXT PRIMARY KEY
    );

    CREATE TABLE IF NOT EXISTS ignored_users (
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

  let cols = db.prepare("PRAGMA table_info(counts)").all() as Array<{
    name: string;
    type: string;
  }>;
  const hasUserId = cols.some((col) => col.name === "userId");
  const hasUser = cols.some((col) => col.name === "user");
  const hasUsername = cols.some((col) => col.name === "username");

  if (!hasUserId && (hasUser || hasUsername)) {
    const sourceCol = hasUser ? "user" : "username";
    db.transaction(() => {
      db.exec("ALTER TABLE counts RENAME TO counts_legacy;");
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
      db.exec("DROP TABLE counts_legacy;");
    })();
  }

  cols = db.prepare("PRAGMA table_info(counts)").all() as Array<{
    name: string;
    type: string;
  }>;
  const countCol = cols.find((col) => col.name === "count");
  if (countCol && !hasTextAffinity(countCol.type)) {
    db.transaction(() => {
      db.exec("ALTER TABLE counts RENAME TO counts_text_legacy;");
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
      db.exec("DROP TABLE counts_text_legacy;");
    })();
  }

  const logCols = db.prepare("PRAGMA table_info(logs)").all() as Array<{
    name: string;
    type: string;
  }>;
  const deltaCol = logCols.find((col) => col.name === "delta");
  if (deltaCol && !hasTextAffinity(deltaCol.type)) {
    db.transaction(() => {
      db.exec("ALTER TABLE logs RENAME TO logs_text_legacy;");
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
      db.exec("DROP TABLE logs_text_legacy;");
    })();
  }
}

function buildStatements(db: Database.Database): GuildDbStatements {
  return {
    selectAllCounts: db.prepare("SELECT userId, count FROM counts"),
    selectCountByUser: db.prepare("SELECT count FROM counts WHERE userId=?"),
    upsertCount: db.prepare(`
      INSERT INTO counts(userId, count) VALUES(?, ?)
      ON CONFLICT(userId) DO UPDATE SET count = excluded.count
    `),
    resetAllCounts: db.prepare("UPDATE counts SET count='0'"),
    countTrackedUsers: db.prepare("SELECT COUNT(*) AS count FROM counts"),
    selectRankedCountsPage: db.prepare(`
      SELECT userId, count
      FROM counts
      ORDER BY LENGTH(count) DESC, count DESC, userId ASC
      LIMIT ? OFFSET ?
    `),
    selectAllImmuneIds: db.prepare("SELECT userId FROM immune"),
    selectImmuneId: db.prepare("SELECT userId FROM immune WHERE userId=?"),
    insertImmuneId: db.prepare("INSERT OR IGNORE INTO immune(userId) VALUES(?)"),
    deleteImmuneId: db.prepare("DELETE FROM immune WHERE userId=?"),
    countImmuneIds: db.prepare("SELECT COUNT(*) AS count FROM immune"),
    selectAllIgnoredIds: db.prepare("SELECT userId FROM ignored_users"),
    selectIgnoredId: db.prepare("SELECT userId FROM ignored_users WHERE userId=?"),
    insertIgnoredId: db.prepare(
      "INSERT OR IGNORE INTO ignored_users(userId) VALUES(?)",
    ),
    deleteIgnoredId: db.prepare("DELETE FROM ignored_users WHERE userId=?"),
    selectSetting: db.prepare("SELECT value FROM settings WHERE key=?"),
    upsertSetting: db.prepare(`
      INSERT INTO settings(key, value) VALUES(?, ?)
      ON CONFLICT(key) DO UPDATE SET value=excluded.value
    `),
    deleteSetting: db.prepare("DELETE FROM settings WHERE key=?"),
    selectRecentLogs: db.prepare(`
      SELECT id, at, actor, target, reason, delta
      FROM logs
      ORDER BY id DESC
      LIMIT ?
    `),
    countLogs: db.prepare("SELECT COUNT(*) AS count FROM logs"),
    insertLog: db.prepare(`
      INSERT INTO logs(at, actor, target, reason, delta)
      VALUES(?,?,?,?,?)
    `),
    countSettings: db.prepare("SELECT COUNT(*) AS count FROM settings"),
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
    ignoredCache: null,
  };
}

export function getGuildDbContext(gid: string): GuildDbContext {
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

  const counts: CounterMap = {};
  const rows = context.statements.selectAllCounts.all() as Array<{
    userId: string;
    count: unknown;
  }>;
  for (const row of rows) {
    counts[row.userId] = coerceBigInt(row.count);
  }

  context.countsCache = counts;
  return counts;
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

function loadIgnoredCache(context: GuildDbContext): Set<string> {
  if (context.ignoredCache) {
    return context.ignoredCache;
  }

  const ids = new Set<string>();
  const rows = context.statements.selectAllIgnoredIds.all() as Array<{
    userId: string;
  }>;
  for (const row of rows) {
    ids.add(row.userId);
  }

  context.ignoredCache = ids;
  return ids;
}

function getCountRow(context: GuildDbContext, userId: string): bigint {
  const row = context.statements.selectCountByUser.get(userId) as
    | { count: unknown }
    | undefined;
  return coerceBigInt(row?.count);
}

export function runGuildMaintenance<T>(
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

export function getAllCounts(gid: string): CounterMap {
  return { ...loadCountsCache(getGuildDbContext(gid)) };
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
  const rows = getGuildDbContext(gid).statements.selectRankedCountsPage.all(
    limit,
    offset,
  ) as Array<{
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

export function getIgnoredUserList(gid: string): string[] {
  return [...loadIgnoredCache(getGuildDbContext(gid))];
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

export function getRecentLogs(gid: string, limit = 20): SbkLogRow[] {
  const rows = getGuildDbContext(gid).statements.selectRecentLogs.all(limit) as Array<{
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
  const row = getGuildDbContext(gid).statements.countLogs.get() as
    | { count: number }
    | undefined;
  return row?.count ?? 0;
}

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

export function addIgnoredUserId(gid: string, userId: string): boolean {
  const context = getGuildDbContext(gid);
  const added = context.statements.insertIgnoredId.run(userId).changes > 0;
  if (added && context.ignoredCache) {
    context.ignoredCache.add(userId);
  }
  return added;
}

export function removeIgnoredUserId(gid: string, userId: string): boolean {
  const context = getGuildDbContext(gid);
  const removed = context.statements.deleteIgnoredId.run(userId).changes > 0;
  if (removed && context.ignoredCache) {
    context.ignoredCache.delete(userId);
  }
  return removed;
}

export function isIgnoredUser(gid: string, userId: string): boolean {
  const context = getGuildDbContext(gid);
  if (context.ignoredCache) {
    return context.ignoredCache.has(userId);
  }
  return !!context.statements.selectIgnoredId.get(userId);
}

export function getGuildDbInfo(gid: string): GuildDbInfo {
  return runGuildMaintenance(gid, (db) => {
    const countRow = db
      .prepare("SELECT COUNT(*) AS count FROM counts")
      .get() as { count: number } | undefined;
    const immuneRow = db
      .prepare("SELECT COUNT(*) AS count FROM immune")
      .get() as { count: number } | undefined;
    const logRow = db
      .prepare("SELECT COUNT(*) AS count FROM logs")
      .get() as { count: number } | undefined;
    const settingsRow = db
      .prepare("SELECT COUNT(*) AS count FROM settings")
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
