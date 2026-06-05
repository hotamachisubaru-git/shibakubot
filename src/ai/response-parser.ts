import {
  ApiRateLimitError,
  buildRateLimitErrorFromResponse,
  rememberApiRateLimit,
} from "./rate-limit";
import { isRecord } from "./model-utils";

export function extractAssistantText(payload: unknown): string | undefined {
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

export function extractTextFromContent(content: unknown): string | undefined {
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

export async function parseModelResponse(
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

function truncateErrorBody(value: string, maxLength = 300): string {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength)}...`;
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
