import type { ChatMessage } from "./model-client";

function findSplitPoint(text: string): number {
  const minSplitIndex = Math.floor(text.length * 0.6);
  const separators = ["\n\n", "\n", " "];

  for (const separator of separators) {
    const index = text.lastIndexOf(separator);
    if (index >= minSplitIndex) {
      return index + separator.length;
    }
  }

  return text.length;
}

function roleLabel(role: ChatMessage["role"]): string {
  if (role === "user") {
    return "ユーザー";
  }
  if (role === "assistant") {
    return "アシスタント";
  }
  return "システム";
}

export function splitForDiscord(content: string, maxLength = 1900): string[] {
  const text = content.trim();
  if (!text) {
    return ["（応答が空でした）"];
  }

  if (text.length <= maxLength) {
    return [text];
  }

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > maxLength) {
    const candidate = remaining.slice(0, maxLength);
    const splitPoint = findSplitPoint(candidate);
    const chunk = remaining.slice(0, splitPoint).trim();

    chunks.push(chunk.length > 0 ? chunk : candidate);
    remaining = remaining.slice(splitPoint).trimStart();
  }

  if (remaining.length > 0) {
    chunks.push(remaining);
  }

  return chunks;
}

export function limitText(text: string, maxChars: number): string {
  const normalized = text.trim();
  if (normalized.length <= maxChars) {
    return normalized;
  }

  return `${normalized.slice(0, maxChars)}\n\n[...省略: MAX_RESPONSE_CHARS を超過しました...]`;
}

export function buildEffectiveSystemPrompt(
  prompt: string,
  guildMemorySummary?: string,
): string {
  const trimmedPrompt = prompt.trim();
  const lines = [
    "あなたはロールプレイ会話を行うAIアシスタントです。",
    "以下の「キャラクター設定」を最優先で守って回答してください。",
    "口調・語尾・性格・テンションを毎回一貫させてください。",
    "説明的な回答でも、話し方は必ずキャラクター設定に合わせてください。",
    "不明な情報は捏造せず、キャラクター口調のまま「分からない」と伝えてください。",
    "最新情報・ニュース・天気・価格・営業時間・日付依存の情報は、利用可能なら検索で確認してから回答してください。",
    "検索が利用できない場合は推測で断定せず、その旨を短く伝えてください。",
    "",
    "キャラクター設定:",
    trimmedPrompt,
  ];

  if (guildMemorySummary && guildMemorySummary.trim().length > 0) {
    lines.push(
      "",
      "サーバー特徴メモ:",
      guildMemorySummary.trim(),
      "",
      "このメモは最近の会話ログから作成した参考情報です。",
      "現在のユーザー発言と直近の会話履歴を優先し、合わない場合は無理に従わないでください。",
    );
  }

  return lines.join("\n");
}

export function singleLine(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength)}...`;
}

export function truncateForPromptView(
  prompt: string,
  maxLength: number,
): string {
  const trimmed = prompt.trim();
  if (trimmed.length <= maxLength) {
    return trimmed;
  }
  return `${trimmed.slice(0, maxLength)}...`;
}

export function renderHistory(
  history: readonly ChatMessage[],
  turns: number,
  currentPrompt: string,
): string {
  const safeTurns = Math.max(1, turns);
  const maxMessages = safeTurns * 2;
  const slicedHistory = history.slice(-maxMessages);

  const lines: string[] = [];
  for (const [index, message] of slicedHistory.entries()) {
    const role = roleLabel(message.role);
    const preview = singleLine(message.content, 220);
    lines.push(`${index + 1}. [${role}] ${preview}`);
  }

  const shownTurns = Math.ceil(slicedHistory.length / 2);
  const totalTurns = Math.ceil(history.length / 2);

  return [
    `会話履歴 (${shownTurns}/${totalTurns} ターン)`,
    `現在のシステムプロンプト: ${singleLine(currentPrompt, 180)}`,
    "",
    ...lines,
  ].join("\n");
}

export function extensionFromMimeType(mimeType: string): string {
  const normalized = mimeType.toLowerCase();
  if (normalized.includes("png")) {
    return "png";
  }
  if (normalized.includes("jpeg") || normalized.includes("jpg")) {
    return "jpg";
  }
  if (normalized.includes("webp")) {
    return "webp";
  }
  return "bin";
}

export function isValidImageSizeInput(size: string): boolean {
  const match = size.trim().match(/^(\d+)\s*[xX]\s*(\d+)$/);
  if (!match) return false;

  const width = Number.parseInt(match[1], 10);
  const height = Number.parseInt(match[2], 10);
  if (!Number.isFinite(width) || !Number.isFinite(height)) return false;
  return width > 0 && height > 0;
}
