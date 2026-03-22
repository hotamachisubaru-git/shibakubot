export type ChatRole = "system" | "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface ModelClient {
  generateReply(messages: readonly ChatMessage[]): Promise<string>;
}

export interface OllamaCompatibleClientOptions {
  endpoint: string;
  modelName: string;
  autoDetectModelNames?: readonly string[];
  apiKey?: string;
  timeoutMs: number;
}

const MODEL_DETECTION_CACHE_TTL_MS = 30_000;
const MODEL_DETECTION_TIMEOUT_MS = 5_000;

type NormalizedModelEntry = Readonly<{
  raw: string;
  normalized: string;
}>;

export class OllamaCompatibleClient implements ModelClient {
  private cachedResolvedModel:
    | Readonly<{ modelName: string; expiresAt: number }>
    | undefined;

  constructor(private readonly options: OllamaCompatibleClientOptions) {}

  async generateReply(messages: readonly ChatMessage[]): Promise<string> {
    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), this.options.timeoutMs);

    try {
      const modelName = await this.resolveModelName();
      const requestBody = JSON.stringify({
        model: modelName,
        messages,
        stream: false,
      });
      const response = await fetch(this.options.endpoint, {
        method: "POST",
        headers: this.buildHeaders(),
        body: requestBody,
        signal: abortController.signal,
      });

      if (!response.ok) {
        const body = truncateErrorBody(await response.text());
        throw new Error(
          `モデルへのリクエストに失敗しました: ${response.status} ${response.statusText}${body ? ` | ${body}` : ""}`,
        );
      }

      const payload = (await response.json()) as unknown;
      const reply = extractAssistantText(payload);
      if (!reply) {
        throw new Error("モデル応答にアシスタントのテキストが含まれていませんでした。");
      }

      return reply.trim();
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`モデルへのリクエストがタイムアウトしました (${this.options.timeoutMs} ms)。`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async resolveModelName(): Promise<string> {
    const candidates = normalizeModelEntries(this.options.autoDetectModelNames);
    if (candidates.length === 0) {
      return this.options.modelName;
    }

    const now = Date.now();
    if (this.cachedResolvedModel && this.cachedResolvedModel.expiresAt > now) {
      return this.cachedResolvedModel.modelName;
    }

    const detectedModel = await this.detectRunningModel(candidates);
    const resolvedModel = detectedModel ?? this.options.modelName;
    this.cachedResolvedModel = {
      modelName: resolvedModel,
      expiresAt: now + MODEL_DETECTION_CACHE_TTL_MS,
    };

    return resolvedModel;
  }

  private async detectRunningModel(
    candidates: readonly NormalizedModelEntry[],
  ): Promise<string | undefined> {
    const endpointCandidates = buildRunningModelEndpointCandidates(this.options.endpoint);

    for (const endpoint of endpointCandidates) {
      try {
        const response = await fetchWithTimeout(endpoint, {
          method: "GET",
          headers: this.buildHeaders(),
        }, MODEL_DETECTION_TIMEOUT_MS);
        if (!response.ok) {
          continue;
        }

        const payload = (await response.json()) as unknown;
        const runningModels = extractRunningModelNames(payload);
        const detected = selectRunningCandidate(candidates, runningModels);
        if (detected) {
          return detected;
        }
      } catch {
        continue;
      }
    }

    return undefined;
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json; charset=utf-8",
    };

    if (this.options.apiKey) {
      headers.Authorization = `Bearer ${this.options.apiKey}`;
    }

    return headers;
  }
}

function buildRunningModelEndpointCandidates(endpoint: string): string[] {
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

async function fetchWithTimeout(
  input: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: abortController.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function extractAssistantText(payload: unknown): string | undefined {
  if (!isRecord(payload)) {
    return undefined;
  }

  const directMessage = payload.message;
  if (isRecord(directMessage) && typeof directMessage.content === "string") {
    return directMessage.content;
  }

  if (typeof payload.response === "string") {
    return payload.response;
  }

  const choices = payload.choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    return undefined;
  }

  const firstChoice = choices[0];
  if (!isRecord(firstChoice)) {
    return undefined;
  }

  if (typeof firstChoice.text === "string") {
    return firstChoice.text;
  }

  const choiceMessage = firstChoice.message;
  if (!isRecord(choiceMessage)) {
    return undefined;
  }

  const choiceContent = choiceMessage.content;
  if (typeof choiceContent === "string") {
    return choiceContent;
  }

  if (!Array.isArray(choiceContent)) {
    return undefined;
  }

  const textParts: string[] = [];
  for (const part of choiceContent) {
    if (!isRecord(part)) {
      continue;
    }
    if (typeof part.text === "string") {
      textParts.push(part.text);
    }
  }

  const merged = textParts.join("").trim();
  return merged.length > 0 ? merged : undefined;
}

function extractRunningModelNames(payload: unknown): string[] {
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

function selectRunningCandidate(
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeModelEntries(values: readonly string[] | undefined): NormalizedModelEntry[] {
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

function truncateErrorBody(value: string, maxLength = 300): string {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength)}...`;
}
