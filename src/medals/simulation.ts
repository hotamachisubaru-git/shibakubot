import { randomInt } from "../utils/sbkRandom";
import {
  SKY_DREAM_TYPE_A_BETS,
  type MedalBet,
  type DrawOutcome,
  type SimulationResult,
  type SkyDreamStageStep,
} from "./types";

const DREAM_JP_RATE = 6n;
const SKY_JP_RATE = 4n;
const RATE_DENOMINATOR = 100n;
const JP_RESET_MULTIPLIER = 200n;

export function baseJackpotForBet(bet: MedalBet): bigint {
  return BigInt(bet) * JP_RESET_MULTIPLIER;
}

export function percentageContribution(wager: bigint, rate: bigint): bigint {
  const rounded = (wager * rate + RATE_DENOMINATOR / 2n) / RATE_DENOMINATOR;
  return rounded > 0n ? rounded : 1n;
}

export function isMedalBet(value: number): value is MedalBet {
  return SKY_DREAM_TYPE_A_BETS.includes(value as MedalBet);
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

export function simulateSkyDreamTypeA(
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
