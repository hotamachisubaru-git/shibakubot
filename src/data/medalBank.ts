import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { MEDAL_BANK_DB_PATH } from "../constants/paths";

export const DEFAULT_MEDAL_BALANCE = 1_000n;
export const MAX_MEDAL_BALANCE = 9_223_372_036_854_775_807n;

export type MedalBalanceChange = Readonly<{
  before: bigint;
  after: bigint;
}>;

export const MEDAL_VIP_TIERS = [
  "bronze",
  "silver",
  "gold",
  "platinum",
  "diamond",
] as const;

export type MedalVipTier = (typeof MEDAL_VIP_TIERS)[number];

export type MedalVipEntry = Readonly<{
  userId: string;
  tier: MedalVipTier;
}>;

export type MedalVipChange = Readonly<{
  before: MedalVipTier | null;
  after: MedalVipTier;
  changed: boolean;
}>;

type MedalBalanceRow = Readonly<{
  balance: bigint | number | string;
}>;

type MedalVipRow = Readonly<{
  user_id: string;
  tier: string;
}>;

function toBigInt(value: bigint | number | string): bigint {
  let balance: bigint;

  if (typeof value === "bigint") {
    balance = value;
  } else if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) {
      throw new TypeError("Stored medal balance must be a safe integer");
    }
    balance = BigInt(value);
  } else {
    const trimmed = value.trim();
    if (trimmed.toUpperCase() === "NULL") {
      balance = DEFAULT_MEDAL_BALANCE;
    } else {
      const normalized = /^\d+$/u.test(trimmed)
        ? trimmed
        : /^\d{1,3}(?:,\d{3})+$/u.test(trimmed)
          ? trimmed.replace(/,/gu, "")
          : null;
      if (normalized === null) {
        throw new TypeError(
          `Invalid stored medal balance: ${JSON.stringify(value)}`,
        );
      }
      balance = BigInt(normalized);
    }
  }

  assertMedalAmount(balance);
  return balance;
}

function assertUserId(userId: string): void {
  if (!/^\d{17,20}$/u.test(userId)) {
    throw new TypeError("Discord user ID must be a 17-20 digit snowflake");
  }
}

export function isMedalVipTier(value: string): value is MedalVipTier {
  return (MEDAL_VIP_TIERS as readonly string[]).includes(value);
}

function assertMedalVipTier(tier: string): asserts tier is MedalVipTier {
  if (!isMedalVipTier(tier)) {
    throw new TypeError(`Invalid medal VIP tier: ${JSON.stringify(tier)}`);
  }
}

function assertMedalAmount(amount: bigint): void {
  if (amount < 0n || amount > MAX_MEDAL_BALANCE) {
    throw new RangeError(
      `Medal amount must be between 0 and ${MAX_MEDAL_BALANCE.toString()}`,
    );
  }
}

function ensureSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS medals (
      user_id TEXT PRIMARY KEY,
      balance INTEGER NOT NULL,
      username TEXT
    );

    CREATE TABLE IF NOT EXISTS medal_vips (
      user_id TEXT PRIMARY KEY,
      added_by TEXT NOT NULL,
      added_at INTEGER NOT NULL,
      tier TEXT NOT NULL DEFAULT 'bronze'
        CHECK (tier IN ('bronze', 'silver', 'gold', 'platinum', 'diamond'))
    );
  `);

  const medalColumns = db.prepare("PRAGMA table_info(medals)").all() as Array<{
    name: string;
  }>;
  if (!medalColumns.some((column) => column.name === "username")) {
    db.exec("ALTER TABLE medals ADD COLUMN username TEXT");
  }

  const vipColumns = db.prepare("PRAGMA table_info(medal_vips)").all() as Array<{
    name: string;
  }>;
  if (!vipColumns.some((column) => column.name === "tier")) {
    db.exec(`
      ALTER TABLE medal_vips
      ADD COLUMN tier TEXT NOT NULL DEFAULT 'bronze'
        CHECK (tier IN ('bronze', 'silver', 'gold', 'platinum', 'diamond'))
    `);
  }
}

export class MedalBankStore {
  private readonly db: Database.Database;

  constructor(databasePath: string) {
    fs.mkdirSync(path.dirname(databasePath), { recursive: true });
    this.db = new Database(databasePath);
    this.db.pragma("journal_mode = WAL");
    this.db.defaultSafeIntegers(true);
    ensureSchema(this.db);
  }

  close(): void {
    if (this.db.open) {
      this.db.close();
    }
  }

  getBalance(userId: string): bigint {
    assertUserId(userId);
    const row = this.db
      .prepare("SELECT balance FROM medals WHERE user_id = ?")
      .get(userId) as MedalBalanceRow | undefined;
    return row ? toBigInt(row.balance) : DEFAULT_MEDAL_BALANCE;
  }

  setBalance(
    userId: string,
    amount: bigint,
    username?: string | null,
  ): MedalBalanceChange {
    assertUserId(userId);
    assertMedalAmount(amount);

    return this.db.transaction(() => {
      const before = this.getBalance(userId);
      this.upsertBalance(userId, amount, username);
      return { before, after: amount };
    })();
  }

  addBalance(
    userId: string,
    amount: bigint,
    username?: string | null,
  ): MedalBalanceChange {
    assertUserId(userId);
    assertMedalAmount(amount);

    return this.db.transaction(() => {
      const before = this.getBalance(userId);
      const after = before + amount;
      assertMedalAmount(after);
      this.upsertBalance(userId, after, username);
      return { before, after };
    })();
  }

  removeBalance(
    userId: string,
    amount: bigint,
    username?: string | null,
  ): MedalBalanceChange {
    assertUserId(userId);
    assertMedalAmount(amount);

    return this.db.transaction(() => {
      const before = this.getBalance(userId);
      const after = before > amount ? before - amount : 0n;
      this.upsertBalance(userId, after, username);
      return { before, after };
    })();
  }

  addVip(
    userId: string,
    actorId: string,
    tier: MedalVipTier,
  ): MedalVipChange {
    assertUserId(userId);
    assertUserId(actorId);
    assertMedalVipTier(tier);

    return this.db.transaction(() => {
      const existing = this.db
        .prepare("SELECT user_id, tier FROM medal_vips WHERE user_id = ?")
        .get(userId) as MedalVipRow | undefined;
      const before = existing?.tier ?? null;
      if (before !== null) {
        assertMedalVipTier(before);
      }

      const changed =
        this.db
          .prepare(`
            INSERT INTO medal_vips(user_id, added_by, added_at, tier)
            VALUES(?, ?, ?, ?)
            ON CONFLICT(user_id) DO UPDATE SET
              added_by = excluded.added_by,
              added_at = excluded.added_at,
              tier = excluded.tier
            WHERE medal_vips.tier <> excluded.tier
          `)
          .run(userId, actorId, BigInt(Date.now()), tier).changes > 0;

      return { before, after: tier, changed };
    })();
  }

  removeVip(userId: string): boolean {
    assertUserId(userId);
    return (
      this.db.prepare("DELETE FROM medal_vips WHERE user_id = ?").run(userId)
        .changes > 0
    );
  }

  listVipIds(): string[] {
    return this.listVips().map((entry) => entry.userId);
  }

  listVips(): MedalVipEntry[] {
    const rows = this.db
      .prepare(
        "SELECT user_id, tier FROM medal_vips ORDER BY added_at ASC, user_id ASC",
      )
      .all() as MedalVipRow[];
    return rows.map((row) => {
      assertMedalVipTier(row.tier);
      return { userId: row.user_id, tier: row.tier };
    });
  }

  private upsertBalance(
    userId: string,
    balance: bigint,
    username?: string | null,
  ): void {
    this.db
      .prepare(`
        INSERT INTO medals(user_id, balance, username)
        VALUES(?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET
          balance = excluded.balance,
          username = COALESCE(excluded.username, medals.username)
      `)
      .run(userId, balance, username?.trim() || null);
  }
}

let defaultStore: MedalBankStore | null = null;

function getDefaultStore(): MedalBankStore {
  if (!defaultStore) {
    defaultStore = new MedalBankStore(MEDAL_BANK_DB_PATH);
  }
  return defaultStore;
}

export function getMedalBalance(userId: string): bigint {
  return getDefaultStore().getBalance(userId);
}

export function setMedalBalance(
  userId: string,
  amount: bigint,
  username?: string | null,
): MedalBalanceChange {
  return getDefaultStore().setBalance(userId, amount, username);
}

export function addMedalBalance(
  userId: string,
  amount: bigint,
  username?: string | null,
): MedalBalanceChange {
  return getDefaultStore().addBalance(userId, amount, username);
}

export function removeMedalBalance(
  userId: string,
  amount: bigint,
  username?: string | null,
): MedalBalanceChange {
  return getDefaultStore().removeBalance(userId, amount, username);
}

export function addMedalVip(
  userId: string,
  actorId: string,
  tier: MedalVipTier,
): MedalVipChange {
  return getDefaultStore().addVip(userId, actorId, tier);
}

export function removeMedalVip(userId: string): boolean {
  return getDefaultStore().removeVip(userId);
}

export function listMedalVipIds(): string[] {
  return getDefaultStore().listVipIds();
}

export function listMedalVips(): MedalVipEntry[] {
  return getDefaultStore().listVips();
}

process.once("exit", () => {
  defaultStore?.close();
  defaultStore = null;
});
