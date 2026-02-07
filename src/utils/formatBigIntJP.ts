const JP_UNITS = [
  { value: 10_000n, label: "万" },
  { value: 100_000_000n, label: "億" },
  { value: 1_0000_0000_0000n, label: "兆" },
  { value: 1_0000_0000_0000_0000n, label: "京" },
  { value: 1_0000_0000_0000_0000_0000n, label: "垓" },
  { value: 1_0000_0000_0000_0000_0000_0000n, label: "秭" },
  { value: 1_0000_0000_0000_0000_0000_0000_0000n, label: "穣" },
  // 必要なら続き追加
] as const;

// n を「上位単位 + 小数」で短縮（例: 1844.67京）
function formatBigIntJPCompact(n: bigint, decimals = 2): string {
  const sign = n < 0n ? "-" : "";
  let x = n < 0n ? -n : n;

  if (x < 10_000n) return sign + x.toString();

  // 一番大きい単位から当てる
  for (let i = JP_UNITS.length - 1; i >= 0; i--) {
    const u = JP_UNITS[i];
    if (x >= u.value) {
      const intPart = x / u.value;
      const rem = x % u.value;

      // 小数部（decimals桁）を bigint で作る
      const scale = 10n ** BigInt(decimals);
      const frac = (rem * scale) / u.value;

      if (decimals <= 0) return `${sign}${intPart}${u.label}`;

      const fracStr = frac.toString().padStart(decimals, "0").replace(/0+$/, "");
      return fracStr
        ? `${sign}${intPart.toString()}.${fracStr}${u.label}`
        : `${sign}${intPart.toString()}${u.label}`;
    }
  }

  // 万未満は上で返ってるので基本ここは来ない
  return sign + x.toString();
}

// さらに「安全に短く」する（最終防衛ライン）
function safeCount(n: bigint, maxLen = 18): string {
  const s = formatBigIntJPCompact(n, 2);
  return s.length > maxLen ? s.slice(0, maxLen) + "…" : s;
}
