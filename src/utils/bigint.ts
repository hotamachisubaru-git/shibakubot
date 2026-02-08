const INTEGER_TEXT_PATTERN = /^[+-]?\d+$/u;

export function parseBigIntInput(raw: string): bigint | null {
  const normalized = raw.trim();
  if (normalized.length === 0 || !INTEGER_TEXT_PATTERN.test(normalized)) {
    return null;
  }

  try {
    return BigInt(normalized);
  } catch {
    return null;
  }
}

export function compareBigIntDesc(left: bigint, right: bigint): number {
  if (left === right) return 0;
  return left > right ? -1 : 1;
}

export function formatSignedBigInt(value: bigint): string {
  return `${value >= 0n ? "+" : ""}${value.toString()}`;
}
