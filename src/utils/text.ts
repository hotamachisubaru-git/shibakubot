export function truncateUtf16(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  if (maxLength <= 0) return "";

  let result = "";
  for (const symbol of value) {
    if (result.length + symbol.length > maxLength) break;
    result += symbol;
  }
  return result;
}

export function truncateUtf16WithEllipsis(
  value: string,
  maxLength: number,
): string {
  if (value.length <= maxLength) return value;
  if (maxLength <= 1) return truncateUtf16(value, maxLength);
  return `${truncateUtf16(value, maxLength - 1)}…`;
}
