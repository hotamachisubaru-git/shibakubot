import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { MEDALS_DB_PATH } from "../constants/paths";
import { MEDAL_START_BALANCE, SKY_DREAM_TYPE_A_BETS, type AccountRow, type JackpotRow, type MedalBet, type SkyDreamJackpotStatus } from "./types";
import { baseJackpotForBet, isMedalBet } from "./simulation";

const BIGINT_RE = /^-?\d+$/;

function ensureDbDir(): void {
  const dir = path.dirname(MEDALS_DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function openMedalsDb(): Database.Database {
  ensureDbDir();
  const db = new Database(MEDALS_DB_PATH);
  db.pragma("journal_mode = WAL");
  ensureSchema(db);
  return db;
}

function ensureSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS medal_accounts (
      guild_id   TEXT NOT NULL,
      user_id    TEXT NOT NULL,
      balance    TEXT NOT NULL DEFAULT '20000',
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (guild_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS medal_jackpots (
      guild_id    TEXT NOT NULL,
      bet         INTEGER NOT NULL,
      dream_value TEXT NOT NULL,
      sky_value   TEXT NOT NULL,
      updated_at  INTEGER NOT NULL,
      PRIMARY KEY (guild_id, bet)
    );

    CREATE TABLE IF NOT EXISTS medal_plays (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id       TEXT NOT NULL,
      user_id        TEXT NOT NULL,
      bet            INTEGER NOT NULL,
      payout         TEXT NOT NULL,
      balance_before TEXT NOT NULL,
      balance_after  TEXT NOT NULL,
      result_type    TEXT NOT NULL,
      detail_json    TEXT NOT NULL,
      created_at     INTEGER NOT NULL
    );
  `);

  const accountColumns = db.prepare(`PRAGMA table_info(medal_accounts)`).all() as Array<{
    name: string;
    pk: number;
    dflt_value: string | null;
  }>;
  const balanceDefault = (
    accountColumns.find((column) => column.name === "balance")?.dflt_value ?? ""
  ).replace(/'/g, "");
  const needsAccountMigration =
    accountColumns.length !== 4 ||
    accountColumns.some((column) => column.name === "username") ||
    !accountColumns.some((column) => column.name === "guild_id" && column.pk === 1) ||
    !accountColumns.some((column) => column.name === "user_id" && column.pk === 2) ||
    !accountColumns.some((column) => column.name === "balance" && column.pk === 0) ||
    balanceDefault !== "20000" ||
    !accountColumns.some(
      (column) => column.name === "updated_at" && column.pk === 0,
    );

  if (!needsAccountMigration) {
    return;
  }

  const legacyRows = db
    .prepare(
      `
        SELECT guild_id, user_id, balance, updated_at
        FROM medal_accounts
        ORDER BY updated_at DESC
      `,
    )
    .all() as Array<{
    guild_id: string;
    user_id: string;
    balance: unknown;
    updated_at: unknown;
  }>;

  db.transaction(() => {
    db.exec(`ALTER TABLE medal_accounts RENAME TO medal_accounts_legacy;`);
    db.exec(`
      CREATE TABLE medal_accounts (
        guild_id   TEXT NOT NULL,
        user_id    TEXT NOT NULL,
        balance    TEXT NOT NULL DEFAULT '20000',
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (guild_id, user_id)
      );
    `);

    const insert = db.prepare(
      `
        INSERT INTO medal_accounts(guild_id, user_id, balance, updated_at)
        VALUES(?, ?, ?, ?)
        ON CONFLICT(guild_id, user_id) DO UPDATE
        SET balance = excluded.balance, updated_at = excluded.updated_at
      `,
    );

    for (const row of legacyRows) {
      const updatedAtValue =
        typeof row.updated_at === "number" && Number.isFinite(row.updated_at)
          ? Math.trunc(row.updated_at)
          : Date.now();
      insert.run(
        row.guild_id,
        row.user_id,
        toDbText(parseDbBigInt(row.balance, MEDAL_START_BALANCE)),
        updatedAtValue,
      );
    }

    db.exec(`DROP TABLE medal_accounts_legacy;`);
  })();
}

export function parseDbBigInt(value: unknown, fallback = 0n): bigint {
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

export function toDbText(value: bigint): string {
  return value.toString();
}

export function ensureAccount(db: Database.Database, guildId: string, userId: string): void {
  db.prepare(
    `
      INSERT OR IGNORE INTO medal_accounts(guild_id, user_id, balance, updated_at)
      VALUES(?, ?, ?, ?)
    `,
  ).run(guildId, userId, toDbText(MEDAL_START_BALANCE), Date.now());
}

function normalizeLegacyStartBalance(
  db: Database.Database,
  guildId: string,
  userId: string,
): void {
  const accountRow = db
    .prepare(
      `
        SELECT balance
        FROM medal_accounts
        WHERE guild_id = ? AND user_id = ?
      `,
    )
    .get(guildId, userId) as AccountRow | undefined;
  if (!accountRow) return;

  const balance = parseDbBigInt(accountRow.balance, MEDAL_START_BALANCE);
  if (balance !== 25_000n) return;

  const playRow = db
    .prepare(
      `
        SELECT 1
        FROM medal_plays
        WHERE guild_id = ? AND user_id = ?
        LIMIT 1
      `,
    )
    .get(guildId, userId);
  if (playRow) return;

  db.prepare(
    `
      UPDATE medal_accounts
      SET balance = ?, updated_at = ?
      WHERE guild_id = ? AND user_id = ?
    `,
  ).run(toDbText(MEDAL_START_BALANCE), Date.now(), guildId, userId);
}

export function getAccountBalance(
  db: Database.Database,
  guildId: string,
  userId: string,
): bigint {
  ensureAccount(db, guildId, userId);
  normalizeLegacyStartBalance(db, guildId, userId);
  const row = db
    .prepare(
      `
        SELECT balance
        FROM medal_accounts
        WHERE guild_id = ? AND user_id = ?
      `,
    )
    .get(guildId, userId) as AccountRow | undefined;
  return parseDbBigInt(row?.balance, MEDAL_START_BALANCE);
}

export function ensureJackpots(db: Database.Database, guildId: string): void {
  const stmt = db.prepare(
    `
      INSERT OR IGNORE INTO medal_jackpots(guild_id, bet, dream_value, sky_value, updated_at)
      VALUES(?, ?, ?, ?, ?)
    `,
  );
  const now = Date.now();
  for (const bet of SKY_DREAM_TYPE_A_BETS) {
    const base = toDbText(baseJackpotForBet(bet));
    stmt.run(guildId, bet, base, base, now);
  }
}

export function getJackpotMap(
  db: Database.Database,
  guildId: string,
): Map<MedalBet, SkyDreamJackpotStatus> {
  ensureJackpots(db, guildId);
  const rows = db
    .prepare(
      `
        SELECT bet, dream_value, sky_value
        FROM medal_jackpots
        WHERE guild_id = ?
        ORDER BY bet ASC
      `,
    )
    .all(guildId) as Array<{
    bet: number;
    dream_value: unknown;
    sky_value: unknown;
  }>;

  const jackpots = new Map<MedalBet, SkyDreamJackpotStatus>();
  for (const row of rows) {
    if (!isMedalBet(row.bet)) continue;
    jackpots.set(row.bet, {
      bet: row.bet,
      dream: parseDbBigInt(row.dream_value, baseJackpotForBet(row.bet)),
      sky: parseDbBigInt(row.sky_value, baseJackpotForBet(row.bet)),
    });
  }
  return jackpots;
}
