export function parseCsvValues(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((token) => token.trim())
    .filter((token): token is string => token.length > 0);
}

export function parseCsvSet(raw: string | undefined): ReadonlySet<string> {
  return new Set(parseCsvValues(raw));
}

type IntRange = Readonly<{
  min?: number;
  max?: number;
}>;

export function parseInteger(
  raw: string | undefined,
  fallback: number,
  range?: IntRange,
): number {
  if (!raw) return fallback;

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed)) return fallback;
  if (range?.min !== undefined && parsed < range.min) return fallback;
  if (range?.max !== undefined && parsed > range.max) return fallback;
  return parsed;
}

export function parseBoolean(
  raw: string | undefined,
  fallback: boolean,
): boolean {
  if (!raw) return fallback;

  const normalized = raw.trim().toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  return fallback;
}

export function parseText(raw: string | undefined): string {
  return raw?.trim() ?? "";
}
