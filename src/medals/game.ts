import Database from "better-sqlite3";
import {
  MEDAL_START_BALANCE,
  SKY_DREAM_TYPE_A_BETS,
  type MedalBet,
  type MedalAccountSnapshot,
  type SkyDreamPlayAttempt,
  type SkyDreamPlayResult,
  type JackpotRow,
  type SkyDreamStageStep,
} from "./types";
import {
  openMedalsDb,
  ensureAccount,
  getAccountBalance,
  ensureJackpots,
  getJackpotMap,
  parseDbBigInt,
  toDbText,
} from "./db";
import {
  simulateSkyDreamTypeA,
  percentageContribution,
  baseJackpotForBet,
  isMedalBet,
} from "./simulation";

function getJackpotSnapshot(
  db: Database.Database,
  guildId: string,
  bet: MedalBet,
): { dream: bigint; sky: bigint } {
  const jackpotRow = db
    .prepare(
      `
        SELECT dream_value, sky_value
        FROM medal_jackpots
        WHERE guild_id = ? AND bet = ?
      `,
    )
    .get(guildId, bet) as JackpotRow | undefined;

  return {
    dream: parseDbBigInt(jackpotRow?.dream_value, baseJackpotForBet(bet)),
    sky: parseDbBigInt(jackpotRow?.sky_value, baseJackpotForBet(bet)),
  };
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

function buildPlayRecord(
  db: Database.Database,
  guildId: string,
  userId: string,
  bet: MedalBet,
  balanceBefore: bigint,
  balanceAfter: bigint,
  dreamBefore: bigint,
  dreamAfter: bigint,
  skyBefore: bigint,
  skyAfter: bigint,
  simulationResultType: string,
  simulationPayout: bigint,
  simulationMultiplier: number | null,
  simulationSteps: readonly SkyDreamStageStep[],
): void {
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
    toDbText(simulationPayout),
    toDbText(balanceBefore),
    toDbText(balanceAfter),
    simulationResultType,
    JSON.stringify({
      multiplier: simulationMultiplier,
      dreamJackpotBefore: toDbText(dreamBefore),
      dreamJackpotAfter: toDbText(dreamAfter),
      skyJackpotBefore: toDbText(skyBefore),
      skyJackpotAfter: toDbText(skyAfter),
      steps: simulationSteps,
    }),
    Date.now(),
  );
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

    const { dream: dreamBefore, sky: skyBefore } = getJackpotSnapshot(db, guildId, bet);

    const dreamAfterContribution =
      dreamBefore + percentageContribution(wager, 6n);
    const skyAfterContribution =
      skyBefore + percentageContribution(wager, 4n);

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

    buildPlayRecord(
      db, guildId, userId, bet,
      balanceBefore, balanceAfter,
      dreamBefore, dreamAfter,
      skyBefore, skyAfter,
      simulation.resultType,
      simulation.payout,
      simulation.multiplier,
      simulation.steps,
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
