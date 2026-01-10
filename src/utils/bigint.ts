const BIGINT_RE = /^[+-]?\d+$/;

export function parseBigIntInput(raw: string): bigint | null {
  const trimmed = raw.trim();
  if (!BIGINT_RE.test(trimmed)) return null;
  try {
    return BigInt(trimmed);
  } catch {
    return null;
  }
}

export function compareBigIntDesc(a: bigint, b: bigint): number {
  if (a === b) return 0;
  return a > b ? -1 : 1;
}

export function formatSignedBigInt(value: bigint): string {
  return value >= 0n ? `+${value}` : value.toString();
}
