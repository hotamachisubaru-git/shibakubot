const DEFAULT_RETRY_AFTER_MS = 60_000;

const limitedUntilByScope = new Map<string, number>();

export class ApiRateLimitError extends Error {
  constructor(
    message: string,
    public readonly retryAfterMs: number,
  ) {
    super(message);
    this.name = "ApiRateLimitError";
  }
}

export function assertApiRequestAllowed(
  scopeKey: string,
  label: string,
): void {
  const limitedUntil = limitedUntilByScope.get(scopeKey);
  if (!limitedUntil) {
    return;
  }

  const retryAfterMs = limitedUntil - Date.now();
  if (retryAfterMs <= 0) {
    limitedUntilByScope.delete(scopeKey);
    return;
  }

  throw createRateLimitError(label, retryAfterMs);
}

export function buildApiRateLimitScopeKey(
  endpoint: string,
  apiKey: string | undefined,
): string {
  return JSON.stringify({
    endpoint: endpoint.trim(),
    apiKey: apiKey?.trim() ?? "",
  });
}

export function buildRateLimitErrorFromResponse(
  response: Response,
  label: string,
  bodyText: string,
  fallbackRetryAfterMs = DEFAULT_RETRY_AFTER_MS,
): ApiRateLimitError {
  const retryAfterMs =
    parseRetryAfterMs(response.headers.get("retry-after")) ??
    parseRetryDelayFromBody(bodyText) ??
    fallbackRetryAfterMs;

  return createRateLimitError(label, retryAfterMs);
}

export function rememberApiRateLimit(
  scopeKey: string,
  retryAfterMs: number,
): void {
  const normalizedRetryAfterMs = normalizeRetryAfterMs(retryAfterMs);
  const nextAllowedAt = Date.now() + normalizedRetryAfterMs;
  const existing = limitedUntilByScope.get(scopeKey) ?? 0;
  if (nextAllowedAt > existing) {
    limitedUntilByScope.set(scopeKey, nextAllowedAt);
  }
}

function createRateLimitError(label: string, retryAfterMs: number): ApiRateLimitError {
  const normalizedRetryAfterMs = normalizeRetryAfterMs(retryAfterMs);
  const seconds = Math.max(1, Math.ceil(normalizedRetryAfterMs / 1000));
  return new ApiRateLimitError(
    `${label} の利用上限に達しています。約 ${seconds} 秒後に再試行してください。`,
    normalizedRetryAfterMs,
  );
}

function normalizeRetryAfterMs(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return DEFAULT_RETRY_AFTER_MS;
  }

  return Math.min(Math.max(Math.ceil(value), 1_000), 24 * 60 * 60 * 1000);
}

function parseRetryAfterMs(value: string | null): number | undefined {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  const asSeconds = Number.parseFloat(trimmed);
  if (Number.isFinite(asSeconds) && asSeconds >= 0) {
    return asSeconds * 1000;
  }

  const asDateMs = Date.parse(trimmed);
  if (Number.isFinite(asDateMs)) {
    return asDateMs - Date.now();
  }

  return undefined;
}

function parseRetryDelayFromBody(bodyText: string): number | undefined {
  const trimmed = bodyText.trim();
  if (!trimmed) {
    return undefined;
  }

  try {
    const retryDelaySeconds = extractRetryDelaySeconds(JSON.parse(trimmed));
    if (retryDelaySeconds === undefined) {
      return undefined;
    }

    return retryDelaySeconds * 1000;
  } catch {
    return undefined;
  }
}

function extractRetryDelaySeconds(value: unknown): number | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const directRetryDelay = parseDurationSeconds(value.retryDelay);
  if (directRetryDelay !== undefined) {
    return directRetryDelay;
  }

  for (const key of ["error", "details"]) {
    const nested = value[key];
    if (Array.isArray(nested)) {
      for (const entry of nested) {
        const parsed = extractRetryDelaySeconds(entry);
        if (parsed !== undefined) {
          return parsed;
        }
      }
      continue;
    }

    const parsed = extractRetryDelaySeconds(nested);
    if (parsed !== undefined) {
      return parsed;
    }
  }

  return undefined;
}

function parseDurationSeconds(value: unknown): number | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const match = value.trim().match(/^(\d+(?:\.\d+)?)s$/i);
  if (!match) {
    return undefined;
  }

  const seconds = Number.parseFloat(match[1]);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
