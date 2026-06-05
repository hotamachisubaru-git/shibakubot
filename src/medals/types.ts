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

export type DrawOutcome =
  | { kind: "next" }
  | { kind: "out" }
  | { kind: "jpc" }
  | { kind: "multiplier"; multiplier: number }
  | { kind: "dream_jp" }
  | { kind: "sky_jp" };

export type SimulationResult = Readonly<{
  resultType: SkyDreamResultType;
  payout: bigint;
  multiplier: number | null;
  steps: readonly SkyDreamStageStep[];
}>;

export type JackpotRow = {
  dream_value: unknown;
  sky_value: unknown;
};

export type AccountRow = {
  balance: unknown;
};
