export type LimitedListOptions<T> = Readonly<{
  maxItems: number;
  maxLength: number;
  formatItem: (item: T, index: number) => string;
  emptyText?: string;
  omittedLabel?: (count: number) => string;
}>;

export function truncateDiscordText(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  if (maxLength <= 1) return value.slice(0, Math.max(0, maxLength));
  return `${value.slice(0, maxLength - 1)}…`;
}

export function formatLimitedList<T>(
  items: readonly T[],
  options: LimitedListOptions<T>,
): string {
  if (items.length === 0) return options.emptyText ?? "（なし）";

  const lines: string[] = [];
  const limit = Math.max(0, Math.min(items.length, options.maxItems));
  for (let index = 0; index < limit; index += 1) {
    const line = options.formatItem(items[index]!, index);
    const omitted = items.length - (index + 1);
    const summary = omitted > 0
      ? options.omittedLabel?.(omitted) ?? `…ほか ${omitted} 件`
      : "";
    const candidate = [...lines, line, ...(summary ? [summary] : [])].join("\n");
    if (candidate.length > options.maxLength) break;
    lines.push(line);
  }

  const omitted = items.length - lines.length;
  if (omitted > 0) {
    const summary = options.omittedLabel?.(omitted) ?? `…ほか ${omitted} 件`;
    while (
      lines.length > 0 &&
      [...lines, summary].join("\n").length > options.maxLength
    ) {
      lines.pop();
    }
    if (summary.length <= options.maxLength) lines.push(summary);
  }

  return lines.join("\n") || (options.emptyText ?? "（なし）");
}
