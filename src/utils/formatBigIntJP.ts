const TEN_THOUSAND = 10_000n;
const DEFAULT_DECIMAL_PLACES = 2;
const DEFAULT_MAX_LENGTH = 18;

const JP_UNITS = [
  { value: 10n ** 4n, label: "万" },
  { value: 10n ** 8n, label: "億" },
  { value: 10n ** 12n, label: "兆" },
  { value: 10n ** 16n, label: "京" },
  { value: 10n ** 20n, label: "垓" },
  { value: 10n ** 24n, label: "秭" },
  { value: 10n ** 28n, label: "穣" },
] as const;

function clampNonNegativeInt(value: number, fallback: number): number {
  if (!Number.isInteger(value) || value < 0) return fallback;
  return value;
}

function truncateWithEllipsis(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  if (maxLen <= 0) return "";
  if (maxLen === 1) return "…";
  return `${text.slice(0, maxLen - 1)}…`;
}

export function formatBigIntJPCompact(
  value: bigint,
  decimals = DEFAULT_DECIMAL_PLACES,
): string {
  const decimalPlaces = clampNonNegativeInt(decimals, DEFAULT_DECIMAL_PLACES);
  const isNegative = value < 0n;
  const absolute = isNegative ? -value : value;
  const sign = isNegative ? "-" : "";

  if (absolute < TEN_THOUSAND) return `${sign}${absolute.toString()}`;

  for (let index = JP_UNITS.length - 1; index >= 0; index--) {
    const unit = JP_UNITS[index];
    if (absolute < unit.value) continue;

    const intPart = absolute / unit.value;
    if (decimalPlaces === 0) return `${sign}${intPart}${unit.label}`;

    const remainder = absolute % unit.value;
    const scale = 10n ** BigInt(decimalPlaces);
    const fractional = (remainder * scale) / unit.value;
    const fractionText = fractional
      .toString()
      .padStart(decimalPlaces, "0")
      .replace(/0+$/u, "");

    if (!fractionText) return `${sign}${intPart}${unit.label}`;
    return `${sign}${intPart}.${fractionText}${unit.label}`;
  }

  return `${sign}${absolute.toString()}`;
}

export function safeCount(value: bigint, maxLen = DEFAULT_MAX_LENGTH): string {
  const normalizedMaxLen = clampNonNegativeInt(maxLen, DEFAULT_MAX_LENGTH);
  return truncateWithEllipsis(
    formatBigIntJPCompact(value, DEFAULT_DECIMAL_PLACES),
    normalizedMaxLen,
  );
}
