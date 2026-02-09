import { randomInt as cryptoRandomInt } from "node:crypto";
import { RANDOM_REASONS } from "../constants/randomReasons";

function assertSafeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${name} は安全な整数である必要があります`);
  }
}

export function randomInt(min: number, max: number): number {
  const normalizedMin = Math.ceil(min);
  const normalizedMax = Math.floor(max);
  assertSafeInteger(normalizedMin, "min");
  assertSafeInteger(normalizedMax, "max");

  if (normalizedMax < normalizedMin) {
    throw new RangeError("max は min 以上である必要があります");
  }
  if (normalizedMax >= Number.MAX_SAFE_INTEGER) {
    throw new RangeError("max が大きすぎます");
  }

  return cryptoRandomInt(normalizedMin, normalizedMax + 1);
}

export function randomReason(): string {
  return RANDOM_REASONS[randomInt(0, RANDOM_REASONS.length - 1)];
}
