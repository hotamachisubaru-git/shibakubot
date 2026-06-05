import { ChatMessage } from "./model-client";

const GEMINI_HOST = "generativelanguage.googleapis.com";

export function isGeminiApiEndpoint(endpoint: string): boolean {
  try {
    return new URL(endpoint).hostname === GEMINI_HOST;
  } catch {
    return false;
  }
}

export function normalizeConfiguredModelName(endpoint: string, modelName: string): string {
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

export function buildGeminiGenerateContentEndpoint(endpoint: string, modelName: string): string {
  const url = new URL(endpoint);
  url.pathname = `/v1beta/models/${encodeURIComponent(modelName)}:generateContent`;
  url.search = "";
  url.hash = "";
  return url.toString();
}

export function extractSystemInstruction(messages: readonly ChatMessage[]): string | undefined {
  const systemMessages = messages
    .filter((message) => message.role === "system")
    .map((message) => message.content.trim())
    .filter((content) => content.length > 0);

  if (systemMessages.length === 0) {
    return undefined;
  }

  return systemMessages.join("\n\n");
}

export function buildGeminiContents(messages: readonly ChatMessage[]): GeminiContent[] {
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

export type GeminiContent = {
  role: "user" | "model";
  parts: Array<{ text: string }>;
};
