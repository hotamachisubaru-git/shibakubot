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
  apiKey?: string;
  timeoutMs: number;
}

export class OllamaCompatibleClient implements ModelClient {
  constructor(private readonly options: OllamaCompatibleClientOptions) {}

  async generateReply(messages: readonly ChatMessage[]): Promise<string> {
    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), this.options.timeoutMs);
    const requestBody = JSON.stringify({
      model: this.options.modelName,
      messages,
      stream: false,
    });

    try {
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
