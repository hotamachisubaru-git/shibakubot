const MODEL_DETECTION_CACHE_TTL_MS = 30_000;
const MODEL_DETECTION_TIMEOUT_MS = 5_000;

export { MODEL_DETECTION_CACHE_TTL_MS, MODEL_DETECTION_TIMEOUT_MS };

export type NormalizedModelEntry = Readonly<{
  raw: string;
  normalized: string;
}>;

export function normalizeModelEntries(values: readonly string[] | undefined): NormalizedModelEntry[] {
  if (!values || values.length === 0) {
    return [];
  }

  const entries: NormalizedModelEntry[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    if (typeof value !== "string") {
      continue;
    }

    const raw = value.trim();
    const normalized = normalizeModelName(raw);
    if (!raw || !normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    entries.push({ raw, normalized });
  }

  return entries;
}

function normalizeModelName(value: string): string {
  return value.trim().toLowerCase();
}

export function buildRunningModelEndpointCandidates(endpoint: string): string[] {
  let endpointUrl: URL;
  try {
    endpointUrl = new URL(endpoint);
  } catch {
    return [];
  }

  const urls = new Set<string>();
  for (const pathname of buildRunningModelPathVariants(endpointUrl.pathname)) {
    const candidate = new URL(endpointUrl.toString());
    candidate.pathname = pathname;
    candidate.search = "";
    candidate.hash = "";
    urls.add(candidate.toString());
  }

  const rootCandidate = new URL(endpointUrl.toString());
  rootCandidate.pathname = "/api/ps";
  rootCandidate.search = "";
  rootCandidate.hash = "";
  urls.add(rootCandidate.toString());

  return [...urls];
}

function buildRunningModelPathVariants(pathname: string): string[] {
  const normalizedPathname = pathname.replace(/\/+$/u, "") || "/";
  const pathVariants = new Set<string>();

  for (const suffix of ["/api/chat", "/v1/chat/completions"]) {
    const replacedPath = replacePathSuffix(normalizedPathname, suffix, "/api/ps");
    if (replacedPath) {
      pathVariants.add(replacedPath);
    }
  }

  pathVariants.add("/api/ps");
  return [...pathVariants];
}

function replacePathSuffix(
  pathname: string,
  suffix: string,
  replacement: string,
): string | undefined {
  if (!pathname.endsWith(suffix)) {
    return undefined;
  }

  const prefix = pathname.slice(0, pathname.length - suffix.length);
  return `${prefix}${replacement}` || replacement;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function extractRunningModelNames(payload: unknown): string[] {
  if (!isRecord(payload) || !Array.isArray(payload.models)) {
    return [];
  }

  const modelNames: string[] = [];
  const seenNames = new Set<string>();
  for (const model of payload.models) {
    if (!isRecord(model)) {
      continue;
    }

    const rawNames = [model.name, model.model];
    for (const rawName of rawNames) {
      if (typeof rawName !== "string") {
        continue;
      }

      const normalized = rawName.trim();
      const normalizedKey = normalizeModelName(normalized);
      if (normalized.length > 0 && !seenNames.has(normalizedKey)) {
        seenNames.add(normalizedKey);
        modelNames.push(normalized);
      }
    }
  }

  return modelNames;
}

export function selectRunningCandidate(
  candidates: readonly NormalizedModelEntry[],
  runningModels: readonly string[],
): string | undefined {
  const normalizedRunningModels = normalizeModelEntries(runningModels);

  for (const candidate of candidates) {
    const exactMatch = normalizedRunningModels.find(
      (runningModel) => runningModel.normalized === candidate.normalized,
    );
    if (exactMatch) {
      return exactMatch.raw;
    }

    const prefixMatch = normalizedRunningModels.find(
      (runningModel) => runningModel.normalized.startsWith(candidate.normalized),
    );
    if (prefixMatch) {
      return prefixMatch.raw;
    }
  }

  return undefined;
}
