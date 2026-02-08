const DEFAULT_SBK_MIN = 1;
const DEFAULT_SBK_MAX = 25;
const DISCORD_SELECT_OPTION_LIMIT = 25;

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;

  return parsed;
}

const envMin = parsePositiveInt(process.env.SBK_MIN, DEFAULT_SBK_MIN);
const envMax = parsePositiveInt(process.env.SBK_MAX, DEFAULT_SBK_MAX);
const normalizedMax = Math.max(envMin, envMax);
const optionsMax = Math.min(
  normalizedMax,
  envMin + DISCORD_SELECT_OPTION_LIMIT - 1,
);

export const SBK_MIN = envMin;
export const SBK_MAX = normalizedMax;
export const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID?.trim() ?? "";
export const SBK_OPTIONS: readonly number[] = Array.from(
  { length: optionsMax - envMin + 1 },
  (_, index) => envMin + index,
);
