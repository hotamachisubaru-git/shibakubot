export function formatMedalCount(value: bigint): string {
  return `${value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")}枚`;
}

export function formatMedalDelta(value: bigint): string {
  const sign = value < 0n ? "-" : "+";
  const abs = value < 0n ? -value : value;
  return `${sign}${formatMedalCount(abs)}`;
}
