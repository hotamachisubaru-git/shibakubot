// 数値フォーマット（BigInt）

export function formatWithComma(v: bigint): string {
  return v.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

// 10^4（万進）で短縮する日本語単位（可読性優先で上限は垓まで）
const JP_UNITS = [
  { value: 10n ** 20n, label: "垓" },
  { value: 10n ** 16n, label: "京" },
  { value: 10n ** 12n, label: "兆" },
  { value: 10n ** 8n, label: "億" },
  { value: 10n ** 4n, label: "万" },
] as const;

// BigInt を日本語単位で短くする（例: 123456789 -> "1億2345万"）
export function formatBigIntJP(v: bigint, maxParts = 2, maxLen = 18): string {
  if (v < 10_000n) return v.toString();

  let rest = v;
  const parts: string[] = [];

  for (const { value, label } of JP_UNITS) {
    if (rest >= value) {
      const q = rest / value;
      rest %= value;
      parts.push(`${q}${label}`);
      if (parts.length >= maxParts) break;
    }
  }

  const s = parts.join("");
  return s.length > maxLen ? s.slice(0, maxLen) + "…" : s;
}

// 表示用: 「短縮（カンマ付き原文）」にする
export function formatCountWithReading(v: bigint): string {
  const short = formatBigIntJP(v);
  const full = formatWithComma(v);
  if (short === full) return `${short}回`;
  return `${short}回（${full}回）`;
}
