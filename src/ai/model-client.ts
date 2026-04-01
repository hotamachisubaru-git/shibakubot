export type ChatRole = "system" | "user" | "assistant";

import {
  ApiRateLimitError,
  assertApiRequestAllowed,
  buildApiRateLimitScopeKey,
  buildRateLimitErrorFromResponse,
  rememberApiRateLimit,
} from "./rate-limit";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface ModelClient {
  generateReply(messages: readonly ChatMessage[]): Promise<string>;
}

export class ModelRequestError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = "ModelRequestError";
  }
}

export interface OllamaCompatibleClientOptions {
  endpoint: string;
  modelName: string;
  autoDetectModelNames?: readonly string[];
  googleSearchEnabled?: boolean;
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
  private readonly rateLimitScopeKey: string;
  private readonly configuredModelName: string;

  constructor(private readonly options: OllamaCompatibleClientOptions) {
    this.rateLimitScopeKey = buildApiRateLimitScopeKey(options.endpoint, options.apiKey);
    this.configuredModelName = normalizeConfiguredModelName(
      options.endpoint,
      options.modelName,
    );
  }

  async generateReply(messages: readonly ChatMessage[]): Promise<string> {
    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), this.options.timeoutMs);

    try {
      assertApiRequestAllowed(this.rateLimitScopeKey, "モデル API");
      const modelName = await this.resolveModelName();
      const payload = this.shouldUseGeminiGoogleSearch()
        ? await this.generateGeminiGroundedReply(modelName, messages, abortController.signal)
        : await this.generateChatCompletionReply(modelName, messages, abortController.signal);
      const reply = extractAssistantText(payload);
      if (!reply) {
        throw new Error("モデル応答にアシスタントのテキストが含まれていませんでした。");
      }

      return reply.trim();
    } catch (error) {
      if (error instanceof ApiRateLimitError) {
        throw error;
      }
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`モデルへのリクエストがタイムアウトしました (${this.options.timeoutMs} ms)。`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private shouldUseGeminiGoogleSearch(): boolean {
    return this.options.googleSearchEnabled === true && isGeminiApiEndpoint(this.options.endpoint);
  }

  private async resolveModelName(): Promise<string> {
    const candidates = normalizeModelEntries(this.options.autoDetectModelNames);
    if (candidates.length === 0) {
      return this.configuredModelName;
    }

    const now = Date.now();
    if (this.cachedResolvedModel && this.cachedResolvedModel.expiresAt > now) {
      return this.cachedResolvedModel.modelName;
    }

    const detectedModel = await this.detectRunningModel(candidates);
    const resolvedModel = detectedModel ?? this.configuredModelName;
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

  private async generateChatCompletionReply(
    modelName: string,
    messages: readonly ChatMessage[],
    signal: AbortSignal,
  ): Promise<unknown> {
    const requestBody = JSON.stringify({
      model: modelName,
      messages,
      stream: false,
    });
    const response = await fetch(this.options.endpoint, {
      method: "POST",
      headers: this.buildHeaders(),
      body: requestBody,
      signal,
    });

    return await parseModelResponse(response, this.rateLimitScopeKey);
  }

  private async generateGeminiGroundedReply(
    modelName: string,
    messages: readonly ChatMessage[],
    signal: AbortSignal,
  ): Promise<unknown> {
    const endpoint = buildGeminiGenerateContentEndpoint(this.options.endpoint, modelName);
    const systemInstruction = extractSystemInstruction(messages);
    const contents = buildGeminiContents(messages);
    const requestBody = JSON.stringify({
      ...(systemInstruction
        ? {
            system_instruction: {
              parts: [{ text: systemInstruction }],
            },
          }
        : {}),
      contents,
      tools: [{ google_search: {} }],
    });

    const response = await fetch(endpoint, {
      method: "POST",
      headers: this.buildGeminiHeaders(),
      body: requestBody,
      signal,
    });

    return await parseModelResponse(response, this.rateLimitScopeKey);
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

  private buildGeminiHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json; charset=utf-8",
    };

    if (this.options.apiKey) {
      headers["x-goog-api-key"] = this.options.apiKey;
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

  const candidates = payload.candidates;
  if (Array.isArray(candidates) && candidates.length > 0) {
    const firstCandidate = candidates[0];
    if (isRecord(firstCandidate)) {
      const candidateContent = firstCandidate.content;
      const candidateText = extractTextFromContent(candidateContent);
      if (candidateText) {
        return candidateText;
      }
    }
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

  return extractTextFromContent(choiceMessage);
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

async function parseModelResponse(
  response: Response,
  rateLimitScopeKey: string,
): Promise<unknown> {
  if (!response.ok) {
    const rawBody = await response.text();
    if (response.status === 429) {
      const rateLimitError = buildRateLimitErrorFromResponse(
        response,
        "モデル API",
        rawBody,
      );
      rememberApiRateLimit(rateLimitScopeKey, rateLimitError.retryAfterMs);
      throw rateLimitError;
    }

    const body = truncateErrorBody(rawBody);
    throw new ModelRequestError(
      `モデルへのリクエストに失敗しました: ${response.status} ${response.statusText}${body ? ` | ${body}` : ""}`,
      response.status,
    );
  }

  return (await response.json()) as unknown;
}

function isGeminiApiEndpoint(endpoint: string): boolean {
  try {
    return new URL(endpoint).hostname === "generativelanguage.googleapis.com";
  } catch {
    return false;
  }
}

function normalizeConfiguredModelName(endpoint: string, modelName: string): string {
  if (!isGeminiApiEndpoint(endpoint)) {
    return modelName;
  }

  return normalizeGeminiModelName(modelName);
}

function normalizeGeminiModelName(modelName: string): string {
  const trimmed = modelName.trim();
  if (!trimmed) {
    return trimmed;
  }

  const withoutPrefix = trimmed.replace(/^models\//iu, "");
  const normalizedKey = withoutPrefix.toLowerCase();

  const previewAliasMap: Readonly<Record<string, string>> = {
    "gemini-3.1-pro": "gemini-3.1-pro-preview",
    "gemini-3.1-flash-lite": "gemini-3.1-flash-lite-preview",
    "gemini-3.1-flash-live": "gemini-3.1-flash-live-preview",
  };

  return previewAliasMap[normalizedKey] ?? withoutPrefix;
}

function buildGeminiGenerateContentEndpoint(endpoint: string, modelName: string): string {
  const url = new URL(endpoint);
  url.pathname = `/v1beta/models/${encodeURIComponent(modelName)}:generateContent`;
  url.search = "";
  url.hash = "";
  return url.toString();
}

function extractSystemInstruction(messages: readonly ChatMessage[]): string | undefined {
  const systemMessages = messages
    .filter((message) => message.role === "system")
    .map((message) => message.content.trim())
    .filter((content) => content.length > 0);

  if (systemMessages.length === 0) {
    return undefined;
  }

  return systemMessages.join("\n\n");
}

function buildGeminiContents(messages: readonly ChatMessage[]): GeminiContent[] {
  const contents: GeminiContent[] = [];

  for (const message of messages) {
    if (message.role === "system") {
      continue;
    }

    const text = message.content.trim();
    if (!text) {
      continue;
    }

    const role = message.role === "assistant" ? "model" : "user";
    const previous = contents[contents.length - 1];
    if (previous && previous.role === role) {
      previous.parts.push({ text });
      continue;
    }

    contents.push({
      role,
      parts: [{ text }],
    });
  }

  return contents;
}

function extractTextFromContent(content: unknown): string | undefined {
  if (!isRecord(content)) {
    return undefined;
  }

  const rawContent = content.content;
  if (typeof rawContent === "string") {
    return rawContent;
  }

  const parts = Array.isArray(content.parts)
    ? content.parts
    : Array.isArray(rawContent)
      ? rawContent
      : undefined;
  if (!parts) {
    return undefined;
  }

  const textParts: string[] = [];
  for (const part of parts) {
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

function truncateErrorBody(value: string, maxLength = 300): string {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength)}...`;
}

type GeminiContent = {
  role: "user" | "model";
  parts: Array<{ text: string }>;
};
