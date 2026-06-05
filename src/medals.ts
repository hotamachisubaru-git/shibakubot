import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { MEDALS_DB_PATH } from "./constants/paths";
import { randomInt } from "./utils/sbkRandom";

export const MEDAL_START_BALANCE = 20_000n;
export const SKY_DREAM_TYPE_A_BETS = [10, 30, 50, 100, 250, 500] as const;

export type MedalBet = (typeof SKY_DREAM_TYPE_A_BETS)[number];
export type SkyDreamResultType =
  | "out"
  | "multiplier"
  | "dream_jp"
  | "sky_jp";
export type SkyDreamStepOutcome =
  | "next"
  | "out"
  | "jpc"
  | "multiplier"
  | "dream_jp"
  | "sky_jp";

export type SkyDreamStageStep = Readonly<{
  totalStage: number;
  zone: "main" | "jpc";
  outcome: SkyDreamStepOutcome;
  multiplier: number | null;
}>;

export type SkyDreamJackpotStatus = Readonly<{
  bet: MedalBet;
  dream: bigint;
  sky: bigint;
}>;

export type MedalAccountSnapshot = Readonly<{
  balance: bigint;
  jackpots: readonly SkyDreamJackpotStatus[];
}>;

export type SkyDreamPlayResult = Readonly<{
  bet: MedalBet;
  balanceBefore: bigint;
  balanceAfter: bigint;
  payout: bigint;
  net: bigint;
  resultType: SkyDreamResultType;
  multiplier: number | null;
  steps: readonly SkyDreamStageStep[];
  dreamJackpotBefore: bigint;
  dreamJackpotAfter: bigint;
  skyJackpotBefore: bigint;
  skyJackpotAfter: bigint;
}>;

export type SkyDreamPlayAttempt =
  | Readonly<{
      ok: true;
      play: SkyDreamPlayResult;
    }>
  | Readonly<{
      ok: false;
      reason: "invalid_bet" | "insufficient_medals";
      balance: bigint;
    }>;

type JackpotRow = {
  dream_value: unknown;
  sky_value: unknown;
};

type AccountRow = {
  balance: unknown;
};

type DrawOutcome =
  | { kind: "next" }
  | { kind: "out" }
  | { kind: "jpc" }
  | { kind: "multiplier"; multiplier: number }
  | { kind: "dream_jp" }
  | { kind: "sky_jp" };

type SimulationResult = Readonly<{
  resultType: SkyDreamResultType;
  payout: bigint;
  multiplier: number | null;
  steps: readonly SkyDreamStageStep[];
}>;

const BIGINT_RE = /^-?\d+$/;
const DREAM_JP_RATE = 6n;
const SKY_JP_RATE = 4n;
const RATE_DENOMINATOR = 100n;
const JP_RESET_MULTIPLIER = 200n;

function ensureDbDir(): void {
  const dir = path.dirname(MEDALS_DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function openMedalsDb(): Database.Database {
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

function parseDbBigInt(value: unknown, fallback = 0n): bigint {
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

function toDbText(value: bigint): string {
  return value.toString();
}

function percentageContribution(wager: bigint, rate: bigint): bigint {
  const rounded = (wager * rate + RATE_DENOMINATOR / 2n) / RATE_DENOMINATOR;
  return rounded > 0n ? rounded : 1n;
}

function baseJackpotForBet(bet: MedalBet): bigint {
  return BigInt(bet) * JP_RESET_MULTIPLIER;
}

function isMedalBet(value: number): value is MedalBet {
  return SKY_DREAM_TYPE_A_BETS.includes(value as MedalBet);
}

function ensureAccount(db: Database.Database, guildId: string, userId: string): void {
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

function ensureJackpots(db: Database.Database, guildId: string): void {
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

function getAccountBalance(
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

function getJackpotMap(
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

function pick<T>(values: readonly T[]): T {
  return values[randomInt(0, values.length - 1)];
}

function drawMainStageSixOutcome(): DrawOutcome {
  const slot = randomInt(0, 3);

  switch (slot) {
    case 0:
      return randomInt(0, 1) === 0
        ? { kind: "jpc" }
        : { kind: "multiplier", multiplier: 10 };
    case 1:
      return { kind: "multiplier", multiplier: 10 };
    case 2:
      return randomInt(0, 1) === 0
        ? { kind: "jpc" }
        : { kind: "multiplier", multiplier: 20 };
    case 3:
      return { kind: "multiplier", multiplier: 20 };
    default:
      throw new RangeError(`invalid stage 6 slot: ${slot}`);
  }
}

function drawMainStage(stage: number): DrawOutcome {
  switch (stage) {
    case 1:
      return pick([{ kind: "next" }, { kind: "out" }]);
    case 2:
      return pick([
        { kind: "next" },
        { kind: "multiplier", multiplier: 1 },
        { kind: "out" },
        { kind: "out" },
      ]);
    case 3:
      return pick([
        { kind: "next" },
        { kind: "next" },
        { kind: "multiplier", multiplier: 5 },
        { kind: "multiplier", multiplier: 3 },
      ]);
    case 4:
      return pick([
        { kind: "next" },
        { kind: "multiplier", multiplier: 3 },
        // x? は可変倍率として扱う
        { kind: "multiplier", multiplier: randomInt(1, 10) },
        { kind: "multiplier", multiplier: 5 },
      ]);
    case 5:
      return pick([
        { kind: "next" },
        { kind: "multiplier", multiplier: 3 },
        { kind: "next" },
        { kind: "multiplier", multiplier: 5 },
      ]);
    case 6:
      return drawMainStageSixOutcome();
    default:
      throw new RangeError(`invalid main stage: ${stage}`);
  }
}

function drawJpcStage(stage: number): DrawOutcome {
  switch (stage) {
    case 1:
      return pick([
        { kind: "next" },
        { kind: "next" },
        { kind: "next" },
        { kind: "multiplier", multiplier: 10 },
      ]);
    case 2:
      return pick([
        { kind: "next" },
        { kind: "next" },
        { kind: "next" },
        { kind: "multiplier", multiplier: 15 },
      ]);
    case 3:
      return pick([
        { kind: "next" },
        { kind: "next" },
        { kind: "next" },
        { kind: "multiplier", multiplier: 20 },
      ]);
    case 4:
      return pick([
        { kind: "next" },
        { kind: "next" },
        { kind: "next" },
        { kind: "multiplier", multiplier: 30 },
      ]);
    case 5:
      return pick([
        { kind: "next" },
        { kind: "next" },
        { kind: "next" },
        { kind: "multiplier", multiplier: 40 },
      ]);
    case 6:
      return pick([
        { kind: "dream_jp" },
        { kind: "sky_jp" },
        { kind: "multiplier", multiplier: 50 },
        { kind: "multiplier", multiplier: 50 },
      ]);
    default:
      throw new RangeError(`invalid JPC stage: ${stage}`);
  }
}

function toStep(
  totalStage: number,
  zone: "main" | "jpc",
  outcome: DrawOutcome,
): SkyDreamStageStep {
  return {
    totalStage,
    zone,
    outcome: outcome.kind,
    multiplier: outcome.kind === "multiplier" ? outcome.multiplier : null,
  };
}

function simulateSkyDreamTypeA(
  bet: MedalBet,
  dreamJackpot: bigint,
  skyJackpot: bigint,
): SimulationResult {
  const steps: SkyDreamStageStep[] = [];

  for (let mainStage = 1; mainStage <= 6; mainStage++) {
    const outcome = drawMainStage(mainStage);
    steps.push(toStep(mainStage, "main", outcome));

    if (outcome.kind === "next") {
      continue;
    }

    if (outcome.kind === "jpc") {
      for (let jpcStage = 1; jpcStage <= 6; jpcStage++) {
        const jpcOutcome = drawJpcStage(jpcStage);
        steps.push(toStep(6 + jpcStage, "jpc", jpcOutcome));

        if (jpcOutcome.kind === "next") {
          continue;
        }

        if (jpcOutcome.kind === "multiplier") {
          return {
            resultType: "multiplier",
            payout: BigInt(jpcOutcome.multiplier) * BigInt(bet),
            multiplier: jpcOutcome.multiplier,
            steps,
          };
        }

        if (
          jpcOutcome.kind === "dream_jp" ||
          jpcOutcome.kind === "sky_jp"
        ) {
          return {
            resultType: jpcOutcome.kind,
            payout:
              jpcOutcome.kind === "dream_jp" ? dreamJackpot : skyJackpot,
            multiplier: null,
            steps,
          };
        }

        throw new Error("invalid JPC outcome");
      }

      throw new Error("SkyDream Type-A JPC did not settle");
    }

    if (outcome.kind === "out") {
      return {
        resultType: "out",
        payout: 0n,
        multiplier: null,
        steps,
      };
    }

    if (outcome.kind !== "multiplier") {
      throw new Error("invalid main-stage outcome");
    }

    return {
      resultType: "multiplier",
      payout: BigInt(outcome.multiplier) * BigInt(bet),
      multiplier: outcome.multiplier,
      steps,
    };
  }

  throw new Error("SkyDream Type-A simulation did not settle");
}

export function describeSkyDreamStep(step: SkyDreamStageStep): string {
  switch (step.outcome) {
    case "next":
      return `${step.totalStage}段目: NEXT`;
    case "out":
      return `${step.totalStage}段目: OUT`;
    case "jpc":
      return `${step.totalStage}段目: JPC`;
    case "multiplier":
      return `${step.totalStage}段目: x${step.multiplier ?? 0}`;
    case "dream_jp":
      return `${step.totalStage}段目: DREAM JP`;
    case "sky_jp":
      return `${step.totalStage}段目: SKY JP`;
  }
}

export function describeSkyDreamResult(play: SkyDreamPlayResult): string {
  switch (play.resultType) {
    case "out":
      return "OUT";
    case "multiplier":
      return `x${play.multiplier ?? 0}`;
    case "dream_jp":
      return "DREAM JP";
    case "sky_jp":
      return "SKY JP";
  }
}

export function getMedalAccountSnapshot(
  guildId: string,
  userId: string,
): MedalAccountSnapshot {
  const db = openMedalsDb();
  const balance = getAccountBalance(db, guildId, userId);
  const jackpotMap = getJackpotMap(db, guildId);
  const jackpots = SKY_DREAM_TYPE_A_BETS.map((bet) => {
    const current = jackpotMap.get(bet);
    return (
      current ?? {
        bet,
        dream: baseJackpotForBet(bet),
        sky: baseJackpotForBet(bet),
      }
    );
  });

  return { balance, jackpots };
}

export function playSkyDreamTypeA(
  guildId: string,
  userId: string,
  bet: number,
): SkyDreamPlayAttempt {
  if (!isMedalBet(bet)) {
    const db = openMedalsDb();
    return {
      ok: false,
      reason: "invalid_bet",
      balance: getAccountBalance(db, guildId, userId),
    };
  }

  const db = openMedalsDb();
  const tx = db.transaction((): SkyDreamPlayAttempt => {
    ensureAccount(db, guildId, userId);
    ensureJackpots(db, guildId);

    const balanceBefore = getAccountBalance(db, guildId, userId);
    const wager = BigInt(bet);
    if (balanceBefore < wager) {
      return {
        ok: false,
        reason: "insufficient_medals",
        balance: balanceBefore,
      };
    }

    const jackpotRow = db
      .prepare(
        `
          SELECT dream_value, sky_value
          FROM medal_jackpots
          WHERE guild_id = ? AND bet = ?
        `,
      )
      .get(guildId, bet) as JackpotRow | undefined;

    const dreamBefore = parseDbBigInt(
      jackpotRow?.dream_value,
      baseJackpotForBet(bet),
    );
    const skyBefore = parseDbBigInt(
      jackpotRow?.sky_value,
      baseJackpotForBet(bet),
    );

    const dreamAfterContribution =
      dreamBefore + percentageContribution(wager, DREAM_JP_RATE);
    const skyAfterContribution =
      skyBefore + percentageContribution(wager, SKY_JP_RATE);

    const simulation = simulateSkyDreamTypeA(
      bet,
      dreamAfterContribution,
      skyAfterContribution,
    );

    const balanceAfter = balanceBefore - wager + simulation.payout;
    const dreamAfter =
      simulation.resultType === "dream_jp"
        ? baseJackpotForBet(bet)
        : dreamAfterContribution;
    const skyAfter =
      simulation.resultType === "sky_jp"
        ? baseJackpotForBet(bet)
        : skyAfterContribution;

    db.prepare(
      `
        UPDATE medal_accounts
        SET balance = ?, updated_at = ?
        WHERE guild_id = ? AND user_id = ?
      `,
    ).run(toDbText(balanceAfter), Date.now(), guildId, userId);

    db.prepare(
      `
        UPDATE medal_jackpots
        SET dream_value = ?, sky_value = ?, updated_at = ?
        WHERE guild_id = ? AND bet = ?
      `,
    ).run(
      toDbText(dreamAfter),
      toDbText(skyAfter),
      Date.now(),
      guildId,
      bet,
    );

    db.prepare(
      `
        INSERT INTO medal_plays(
          guild_id,
          user_id,
          bet,
          payout,
          balance_before,
          balance_after,
          result_type,
          detail_json,
          created_at
        )
        VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
    ).run(
      guildId,
      userId,
      bet,
      toDbText(simulation.payout),
      toDbText(balanceBefore),
      toDbText(balanceAfter),
      simulation.resultType,
      JSON.stringify({
        multiplier: simulation.multiplier,
        dreamJackpotBefore: toDbText(dreamBefore),
        dreamJackpotAfter: toDbText(dreamAfter),
        skyJackpotBefore: toDbText(skyBefore),
        skyJackpotAfter: toDbText(skyAfter),
        steps: simulation.steps,
      }),
      Date.now(),
    );

    return {
      ok: true,
      play: {
        bet,
        balanceBefore,
        balanceAfter,
        payout: simulation.payout,
        net: simulation.payout - wager,
        resultType: simulation.resultType,
        multiplier: simulation.multiplier,
        steps: simulation.steps,
        dreamJackpotBefore: dreamBefore,
        dreamJackpotAfter: dreamAfter,
        skyJackpotBefore: skyBefore,
        skyJackpotAfter: skyAfter,
      },
    };
  });

  return tx();
}
