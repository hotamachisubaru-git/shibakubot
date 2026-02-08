const TEN_THOUSAND = 10_000n;
const DEFAULT_MAX_PARTS = 2;
const DEFAULT_MAX_LENGTH = 18;

export function formatWithComma(value: bigint): string {
  return value.toString().replace(/\B(?=(\d{3})+(?!\d))/gu, ",");
}

const JP_UNITS = [
  { value: 10n ** 20n, label: "垓" },
  { value: 10n ** 16n, label: "京" },
  { value: 10n ** 12n, label: "兆" },
  { value: 10n ** 8n, label: "億" },
  { value: 10n ** 4n, label: "万" },
] as const;

function normalizePositiveInt(value: number, fallback: number): number {
  if (!Number.isInteger(value) || value < 1) return fallback;
  return value;
}

function truncateWithEllipsis(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  if (maxLen <= 0) return "";
  if (maxLen === 1) return "…";
  return `${text.slice(0, maxLen - 1)}…`;
}

export function formatBigIntJP(
  value: bigint,
  maxParts = DEFAULT_MAX_PARTS,
  maxLen = DEFAULT_MAX_LENGTH,
): string {
  const normalizedMaxParts = normalizePositiveInt(maxParts, DEFAULT_MAX_PARTS);
  const normalizedMaxLen = normalizePositiveInt(maxLen, DEFAULT_MAX_LENGTH);
  const isNegative = value < 0n;
  const absolute = isNegative ? -value : value;

  if (absolute < TEN_THOUSAND) return value.toString();

  let rest = absolute;
  const parts: string[] = [];

  for (const unit of JP_UNITS) {
    if (rest < unit.value) continue;

    const quotient = rest / unit.value;
    rest %= unit.value;
    parts.push(`${quotient}${unit.label}`);
    if (parts.length >= normalizedMaxParts) break;
  }

  const body = parts.join("");
  const signed = isNegative ? `-${body}` : body;
  return truncateWithEllipsis(signed, normalizedMaxLen);
}

export function formatCountWithReading(value: bigint): string {
  const short = formatBigIntJP(value);
  const full = formatWithComma(value);
  if (short === full) return `${short}回`;
  return `${short}回（${full}回）`;
}
