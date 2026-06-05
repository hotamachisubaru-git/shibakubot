// src/commands/menu/format.ts
const JP_UNITS = [
  { value: 10n ** 28n, label: "穣" },
  { value: 10n ** 24n, label: "秭" },
  { value: 10n ** 20n, label: "垓" },
  { value: 10n ** 16n, label: "京" },
  { value: 10n ** 12n, label: "兆" },
  { value: 10n ** 8n, label: "億" },
  { value: 10n ** 4n, label: "万" },
] as const;

export function formatBigIntJP(n: bigint, maxParts = 3): string {
  if (n < 10_000n) return n.toString();
  let rest = n;
  const parts: string[] = [];
  for (const { value, label } of JP_UNITS) {
    if (rest >= value) {
      const q = rest / value;
      rest %= value;
      parts.push(`${q}${label}`);
      if (parts.length >= maxParts) break;
    }
  }
  return parts.join("");
}

export function formatWithComma(v: bigint): string {
  return v.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function safeCount(n: bigint, maxLen = 20): string {
  const s = formatBigIntJP(n);
  return s.length > maxLen ? s.slice(0, maxLen) + "…" : s;
}

export function formatCountWithReading(n: bigint): string {
  const short = safeCount(n);
  const full = formatWithComma(n);
  if (full === short) return `${short}回`;
  return `${short}回（${full}回）`;
}

export function safeSignedBigInt(value: bigint): string {
  const sign = value < 0n ? "-" : "+";
  const abs = value < 0n ? -value : value;
  return sign + safeCount(abs, 16);
}
