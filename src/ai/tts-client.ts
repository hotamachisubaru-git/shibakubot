import {
  ApiRateLimitError,
  assertApiRequestAllowed,
  buildApiRateLimitScopeKey,
  buildRateLimitErrorFromResponse,
  rememberApiRateLimit,
} from "./rate-limit";

export interface SpeechGenerationRequest {
  text: string;
}

export interface GeneratedSpeech {
  bytes: Buffer;
  mimeType: string;
}

export interface TtsClientOptions {
  endpoint: string;
  modelName?: string;
  voice?: string;
  modelUrl?: string;
  apiKey?: string;
  timeoutMs: number;
  responseFormat: string;
  speed: number;
  pitch?: number;
}

export class TtsClient {
  private readonly rateLimitScopeKey: string;

  constructor(private readonly options: TtsClientOptions) {
    this.rateLimitScopeKey = buildApiRateLimitScopeKey(options.endpoint, options.apiKey);
  }

  async generateSpeech(request: SpeechGenerationRequest): Promise<GeneratedSpeech> {
    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), this.options.timeoutMs);

    try {
      assertApiRequestAllowed(this.rateLimitScopeKey, "TTS API");
      const response = await fetch(this.options.endpoint, {
        method: "POST",
        headers: this.buildHeaders(),
        body: JSON.stringify(buildRequestBody(this.options, request)),
        signal: abortController.signal,
      });

      return await parseSpeechResponse(
        response,
        this.rateLimitScopeKey,
        this.options.responseFormat,
        this.options.timeoutMs,
      );
    } catch (error) {
      if (error instanceof ApiRateLimitError) {
        throw error;
      }
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`TTS リクエストがタイムアウトしました (${this.options.timeoutMs} ms)。`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (this.options.apiKey) {
      headers.Authorization = `Bearer ${this.options.apiKey}`;
    }

    return headers;
  }
}

function buildRequestBody(
  options: TtsClientOptions,
  request: SpeechGenerationRequest,
): Record<string, unknown> {
  if (isOpenAiSpeechEndpoint(options.endpoint)) {
    return omitUndefined({
      model: options.modelName,
      voice: options.voice,
      input: request.text,
      response_format: options.responseFormat,
      speed: options.speed,
    });
  }

  return omitUndefined({
    text: request.text,
    input: request.text,
    model: options.modelName,
    voice: options.voice,
    speaker: options.voice,
    format: options.responseFormat,
    response_format: options.responseFormat,
    speed: options.speed,
    pitch: options.pitch,
    model_url: options.modelUrl,
    rvc_model_url: options.modelUrl,
  });
}

function isOpenAiSpeechEndpoint(endpoint: string): boolean {
  try {
    const pathname = new URL(endpoint).pathname.replace(/\/+$/u, "");
    return pathname.endsWith("/audio/speech");
  } catch {
    return false;
  }
}

async function parseSpeechResponse(
  response: Response,
  rateLimitScopeKey: string,
  fallbackFormat: string,
  timeoutMs: number,
): Promise<GeneratedSpeech> {
  if (!response.ok) {
    const rawBody = await response.text();
    if (response.status === 429) {
      const rateLimitError = buildRateLimitErrorFromResponse(
        response,
        "TTS API",
        rawBody,
      );
      rememberApiRateLimit(rateLimitScopeKey, rateLimitError.retryAfterMs);
      throw rateLimitError;
    }

    const body = truncateErrorBody(rawBody);
    throw new Error(
      `TTS リクエストに失敗しました: ${response.status} ${response.statusText}${body ? ` | ${body}` : ""}`,
    );
  }

  const contentType = normalizeContentType(response.headers.get("content-type"));
  if (contentType.startsWith("audio/") || contentType === "application/octet-stream") {
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length === 0) {
      throw new Error("TTS の応答音声データが空でした。");
    }
    return {
      bytes,
      mimeType: contentType === "application/octet-stream"
        ? mimeTypeFromFormat(fallbackFormat)
        : contentType,
    };
  }

  const payload = (await response.json()) as unknown;
  const audioPayload = extractAudioPayload(payload);
  if (audioPayload.url) {
    return await downloadGeneratedSpeech(audioPayload.url, audioPayload.mimeType, fallbackFormat, timeoutMs);
  }
  if (!audioPayload.base64) {
    throw new Error("TTS の応答に音声データが含まれていません。");
  }

  return {
    bytes: decodeBase64Audio(audioPayload.base64),
    mimeType: audioPayload.mimeType ?? mimeTypeFromFormat(fallbackFormat),
  };
}

async function downloadGeneratedSpeech(
  url: string,
  mimeType: string | undefined,
  fallbackFormat: string,
  timeoutMs: number,
): Promise<GeneratedSpeech> {
  const response = await fetchWithTimeout(url, { method: "GET" }, timeoutMs);
  if (!response.ok) {
    const rawBody = await response.text();
    const body = truncateErrorBody(rawBody);
    throw new Error(
      `TTS 音声のダウンロードに失敗しました: ${response.status} ${response.statusText}${body ? ` | ${body}` : ""}`,
    );
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length === 0) {
    throw new Error("TTS のダウンロード音声データが空でした。");
  }

  return {
    bytes,
    mimeType:
      normalizeContentType(response.headers.get("content-type")) ||
      mimeType ||
      mimeTypeFromFormat(fallbackFormat),
  };
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

function extractAudioPayload(
  payload: unknown,
): Readonly<{ base64?: string; mimeType?: string; url?: string }> {
  if (!isRecord(payload)) {
    throw new Error("TTS の応答が不正な形式です。");
  }

  const directMimeType = readMimeType(payload);

  const directBase64 = readBase64Field(payload);
  if (directBase64) {
    return {
      base64: directBase64,
      mimeType: directMimeType,
    };
  }

  const directUrl = typeof payload.url === "string" ? payload.url.trim() : "";
  if (directUrl) {
    return {
      url: directUrl,
      mimeType: directMimeType,
    };
  }

  const audio = payload.audio;
  if (isRecord(audio)) {
    const base64 = readBase64Field(audio);
    const url = typeof audio.url === "string" ? audio.url.trim() : "";
    if (base64 || url) {
      return {
        base64,
        url: url || undefined,
        mimeType: readMimeType(audio) ?? directMimeType,
      };
    }
  } else if (typeof audio === "string" && audio.trim().length > 0) {
    return {
      base64: audio.trim(),
      mimeType: directMimeType,
    };
  }

  const data = payload.data;
  if (Array.isArray(data) && data.length > 0) {
    const first = data[0];
    if (isRecord(first)) {
      const base64 = readBase64Field(first);
      const url = typeof first.url === "string" ? first.url.trim() : "";
      if (base64 || url) {
        return {
          base64,
          url: url || undefined,
          mimeType: readMimeType(first) ?? directMimeType,
        };
      }
    }
  }

  const details = readErrorHint(payload);
  throw new Error(`TTS の応答に音声データが含まれていません。${details}`);
}

function readBase64Field(record: Record<string, unknown>): string | undefined {
  for (const key of ["audio_base64", "b64_json", "base64", "data"]) {
    const value = record[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  return undefined;
}

function readMimeType(record: Record<string, unknown>): string | undefined {
  for (const key of ["mime_type", "mimeType", "content_type", "contentType"]) {
    const value = record[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return normalizeContentType(value);
    }
  }

  return undefined;
}

function decodeBase64Audio(value: string): Buffer {
  let normalized = value.trim();
  const dataUrlPrefix = "base64,";
  const dataUrlMarkerIndex = normalized.indexOf(dataUrlPrefix);
  if (dataUrlMarkerIndex >= 0) {
    normalized = normalized.slice(dataUrlMarkerIndex + dataUrlPrefix.length);
  }

  const bytes = Buffer.from(normalized, "base64");
  if (bytes.length === 0) {
    throw new Error("デコード後の音声データが空でした。");
  }

  return bytes;
}

function mimeTypeFromFormat(format: string): string {
  const normalized = format.trim().toLowerCase();
  if (normalized === "wav") {
    return "audio/wav";
  }
  if (normalized === "flac") {
    return "audio/flac";
  }
  if (normalized === "ogg" || normalized === "opus") {
    return "audio/ogg";
  }
  if (normalized === "aac") {
    return "audio/aac";
  }
  if (normalized === "m4a" || normalized === "mp4") {
    return "audio/mp4";
  }
  return "audio/mpeg";
}

function normalizeContentType(value: string | null | undefined): string {
  return value?.split(";", 1)[0]?.trim().toLowerCase() ?? "";
}

function readErrorHint(payload: Record<string, unknown>): string {
  for (const key of ["detail", "error", "message"]) {
    const value = payload[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return ` 追跡情報: ${truncateErrorBody(value)}`;
    }
  }

  return "";
}

function omitUndefined(value: Record<string, unknown>): Record<string, unknown> {
  const entries = Object.entries(value).filter(([, item]) => item !== undefined);
  return Object.fromEntries(entries);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function truncateErrorBody(value: string, maxLength = 300): string {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength)}...`;
}
