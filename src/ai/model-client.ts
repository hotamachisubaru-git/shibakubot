export type ChatRole = "system" | "user" | "assistant";

import {
  ApiRateLimitError,
  assertApiRequestAllowed,
  buildApiRateLimitScopeKey,
} from "./rate-limit";
import {
  MODEL_DETECTION_CACHE_TTL_MS,
  MODEL_DETECTION_TIMEOUT_MS,
  buildRunningModelEndpointCandidates,
  extractRunningModelNames,
  isRecord,
  normalizeModelEntries,
  selectRunningCandidate,
  type NormalizedModelEntry,
} from "./model-utils";
import {
  extractAssistantText,
  ModelRequestError,
  parseModelResponse,
} from "./response-parser";
import {
  buildGeminiContents,
  buildGeminiGenerateContentEndpoint,
  extractSystemInstruction,
  isGeminiApiEndpoint,
  normalizeConfiguredModelName,
  type GeminiContent,
} from "./gemini-utils";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface ModelClient {
  generateReply(messages: readonly ChatMessage[]): Promise<string>;
}

export { ModelRequestError };

export interface OllamaCompatibleClientOptions {
  endpoint: string;
  modelName: string;
  autoDetectModelNames?: readonly string[];
  googleSearchEnabled?: boolean;
  apiKey?: string;
  timeoutMs: number;
}

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
