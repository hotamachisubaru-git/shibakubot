export function formatWithComma(v: bigint): string {
  return v.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
const EMBED_DESCRIPTION_LIMIT = 4096;

export function formatBigIntJP(v: bigint): string {
  const units = ['','万','億','兆','京','垓','秭','穣','溝','澗','正','載','極'];
  let n = v;
  let i = 0;
  let parts: string[] = [];

  while (n > 0n && i < units.length) {
    const rem = n % 10000n;
    if (rem > 0n) {
      parts.unshift(`${rem}${units[i]}`);
    }
    n /= 10000n;
    i++;
  }

  return parts.length ? parts.join('') : '0';
}

export function formatCountForRanking(v: bigint): string {
  return `${formatBigIntJP(v)}回（${formatWithComma(v)}回）`;
}
